import { Hono } from "hono";
import { desc, gte, sql } from "drizzle-orm";
import type { Db, Executor } from "@bbc/db";
import { demandDaily } from "@bbc/db/schema/catalog";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { rateLimit } from "@bbc/platform/ratelimit";
import { SearchEvent } from "@bbc/platform";
import { apiError } from "@bbc/shared/errors";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { airportsRepo } from "./infrastructure/airports.repo";
import { faresRepo } from "./infrastructure/fares.repo";
import { createDestinationsCache } from "./application/destinations-cache";
import { recordSearch, rollupDemand } from "./application/demand";
import { expireFares } from "./application/expire-fares";
import { importCatalog, ImportBody } from "./application/import";
import { toAirportVM, toEstimateVM, toFareVM } from "./application/to-fare-vm";
import { readStoredRules } from "./pricing/rules";
import type { CatalogFacade } from "./api";

function isVisible(row: { published: boolean; validFrom: Date; validUntil: Date }, now = new Date()) {
  return row.published && row.validFrom <= now && row.validUntil > now;
}

export const catalogModule = (): ModuleDescriptor<Record<string, never>, CatalogFacade> => ({
  name: "catalog",
  layer: "domain",
  init: ({ db, platform, env }) => {
    const conn = db as unknown as Executor;
    const destinationsCache = createDestinationsCache();
    const invalidateMaps = async () => {
      destinationsCache.clear();
      await platform.cache.bump("catalog:dest:gen");
      await platform.cache.bump("catalog:airports:gen");
    };
    const expose: CatalogFacade = {
      searchFares: (exec, q) => faresRepo.search(exec ?? conn, q),
      getFare: (exec, id) => faresRepo.getAny(exec ?? conn, id),
      destinations: async (exec, home) => {
        if (exec) return faresRepo.destinations(exec, home);
        const gen = await platform.cache.generation("catalog:dest:gen");
        if (gen == null) return destinationsCache.get(home, () => faresRepo.destinations(conn, home));
        const code = home.toUpperCase();
        return platform.cache.getOrLoad(`catalog:dest:${gen}:${code}`, 60, () => faresRepo.destinations(conn, home));
      },
      searchAirports: (exec, q) => airportsRepo.search(exec ?? conn, q),
      getAirport: (exec, code) => airportsRepo.get(exec ?? conn, code),
      getAirports: (exec, codes) => airportsRepo.getMany(exec ?? conn, [...codes]),
      importCsv: (input) => importCatalog({ db: conn as Db }, ImportBody.parse(input)),
    };

    const routes = new Hono<AppEnv>();

    registerRoute("GET", "/v1/search", "fares:read", "search");
    routes.get(
      "/search",
      rateLimit(platform.rateLimit, "search"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const from = (c.req.query("from") ?? "").toUpperCase();
        const to = (c.req.query("to") ?? "").toUpperCase();
        const cabin = c.req.query("cabin") as "business" | "first" | undefined;
        const whenRaw = c.req.query("when");
        if (!from || from.length !== 3 || !to || to.length !== 3 || (cabin !== "business" && cabin !== "first")) {
          return c.json(apiError("VALIDATION", { message: "from, to (IATA), cabin required" }), 400);
        }
        const when = whenRaw ? new Date(whenRaw) : undefined;
        if (when && Number.isNaN(when.getTime())) {
          return c.json(apiError("VALIDATION", { message: "when must be ISO datetime" }), 400);
        }

        const [fromApt, toApt, rows] = await Promise.all([
          airportsRepo.get(conn, from),
          airportsRepo.get(conn, to),
          faresRepo.search(conn, { from, to, cabin, ...(when ? { when } : {}) }),
        ]);
        if (!fromApt || !toApt) return c.json(apiError("NOT_FOUND", { message: "unknown airport" }), 404);

        const items = rows.map((r) => toFareVM(r, { from: fromApt, to: toApt }, false));
        const month = (when ?? new Date()).toISOString().slice(0, 7);
        platform.search.note({
          from,
          to,
          cabin,
          month,
          hadFares: items.length > 0,
          results: items.length,
        });
        // No fare in this cabin: the company's formula, as an indicative price (ADR-IMPL-037). Undated searches only —
        // with a date, the route may have fares on other days, and published fares always win. Both flag rows are read
        // only then, so searches with fares cost nothing extra; both are cached (~35 s to reach every replica), and a
        // failed read counts as off. The rules are not in the repository: each environment holds them in
        // `catalog.pricing_rules` (scripts/load-pricing-rules.ts); without valid rules there is no estimate, never an error.
        let estimate: ReturnType<typeof toEstimateVM> = null;
        if (items.length === 0 && !when && (await platform.flags.isEnabled("catalog.estimates", false))) {
          const stored = readStoredRules(await platform.flags.read("catalog.pricing_rules"));
          if (stored.ok) estimate = toEstimateVM(stored.rules, fromApt, toApt, cabin);
          else platform.metrics.inc("search_estimates_unavailable", { reason: stored.reason });
        }
        if (estimate) platform.metrics.inc("search_estimates_shown", { cabin });
        return c.json({
          from: toAirportVM(fromApt),
          to: toAirportVM(toApt),
          items,
          offer: null,
          estimate,
        });
      },
    );

    registerRoute("GET", "/v1/fares/:id", "fares:read", "read");
    routes.get(
      "/fares/:id",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const id = c.req.param("id");
        const row = await faresRepo.getAny(conn, id);
        if (!row) return c.json(apiError("NOT_FOUND"), 404);
        if (!isVisible(row)) {
          return c.json(
            apiError("GONE", {
              message: "This fare has closed.",
              context: {
                price: parseFloat(row.price),
                currency: row.currency,
                validUntil: row.validUntil.toISOString(),
                from: row.routeFrom,
                to: row.routeTo,
              },
            }),
            410,
          );
        }

        const [fromApt, toApt] = await Promise.all([
          airportsRepo.get(conn, row.routeFrom),
          airportsRepo.get(conn, row.routeTo),
        ]);
        if (!fromApt || !toApt) return c.json(apiError("NOT_FOUND"), 404);
        return c.json(toFareVM(row, { from: fromApt, to: toApt }, false));
      },
    );

    registerRoute("GET", "/v1/airports", "fares:read", "read");
    routes.get(
      "/airports",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const q = (c.req.query("q") ?? "").slice(0, 64);
        const gen = await platform.cache.generation("catalog:airports:gen");
        const rows =
          gen == null
            ? await airportsRepo.search(conn, q)
            : await platform.cache.getOrLoad(`catalog:airports:${gen}:${q.toLowerCase()}`, 60, () =>
                airportsRepo.search(conn, q),
              );
        return c.json(rows.map((r) => toAirportVM(r)));
      },
    );

    registerRoute("POST", "/v1/internal/catalog/import", "catalog:import");
    routes.post(
      "/internal/catalog/import",
      authorize("catalog:import", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const parsed = ImportBody.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        try {
          const r = await expose.importCsv(parsed.data);
          await invalidateMaps();
          return c.json(r);
        } catch (e: unknown) {
          return c.json(apiError("VALIDATION", { message: e instanceof Error ? e.message : "import failed" }), 400);
        }
      },
    );

    registerRoute("GET", "/v1/internal/demand", "ops:read");
    routes.get(
      "/internal/demand",
      authorize("ops:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const days = Number(c.req.query("days") ?? "7");
        if (!Number.isInteger(days) || days < 1 || days > 90) {
          return c.json(apiError("VALIDATION", { message: "days must be an integer from 1 to 90" }), 400);
        }
        const since = new Date(Date.now() - days * 86_400_000);
        const rows = await conn
          .select({
            from: demandDaily.routeFrom,
            to: demandDaily.routeTo,
            cabin: demandDaily.cabin,
            searches: sql<number>`sum(${demandDaily.searches})::int`.mapWith(Number),
            searchesWithoutFare: sql<number>`sum(${demandDaily.searchesWithoutFare})::int`.mapWith(Number),
          })
          .from(demandDaily)
          .where(gte(demandDaily.day, since))
          .groupBy(demandDaily.routeFrom, demandDaily.routeTo, demandDaily.cabin)
          .orderBy(desc(sql`sum(${demandDaily.searchesWithoutFare})`), desc(sql`sum(${demandDaily.searches})`));
        return c.json({ days, routes: rows });
      },
    );

    if (platform.kafka && platform.redis && env.APP_ROLE !== "api" && env.KAFKA_BROKERS) {
      const redis = platform.redis;
      const loop = platform.kafka
        .consume({
          clientId: "bbc-demand",
          groupId: "catalog.demand",
          topic: "bbc.search.v1",
          consumerName: "catalog.demand",
          signal: platform.signal,
          handle: async (_eventId, value) => {
            const parsed = SearchEvent.safeParse(value);
            if (!parsed.success) {
              platform.metrics.inc("search_events_rejected");
              return;
            }
            await recordSearch(redis, parsed.data);
          },
        })
        .catch((err: unknown) => {
          platform.logger.error({ err: String(err) }, "demand consumer stopped");
        });
      platform.lifecycle.onClose(async () => {
        await loop;
      });
    }

    return {
      exposes: expose,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [],
      jobs: [
        {
          name: "expire-fares",
          spec: {
            cron: "*/15 * * * *",
            singleton: true,
            timeoutMs: 30_000,
            handler: async () => {
              const out = await expireFares({ db: conn });
              await invalidateMaps();
              return out;
            },
          },
        },
        {
          name: "demand-rollup",
          spec: {
            cron: "15 3 * * *",
            singleton: true,
            timeoutMs: 60_000,
            handler: async () => {
              if (!platform.redis) return { skipped: 1, rows: 0 };
              return { skipped: 0, ...(await rollupDemand(platform.redis, conn)) };
            },
          },
        },
      ],
    };
  },
});
