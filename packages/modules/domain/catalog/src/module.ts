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
import { PLACE_PHOTOS_MAX_CODES, type PlacePhotoVM } from "@bbc/shared/api/v1/places";
import { airportsRepo } from "./infrastructure/airports.repo";
import { discoveryRepo } from "./infrastructure/discovery.repo";
import { faresRepo } from "./infrastructure/fares.repo";
import { placePhotosRepo } from "./infrastructure/place-photos.repo";
import { createDestinationsCache } from "./application/destinations-cache";
import { recordSearch, rollupDemand } from "./application/demand";
import { expireFares } from "./application/expire-fares";
import { homeZones, popularFrom } from "./application/discovery";
import { importCatalog, ImportBody } from "./application/import";
import { PlacePhotoOverride, parseCodes, resolvePlacePhotos, toPlacePhotoVM } from "./application/place-photos";
import type { Fetch } from "./application/place-photo-sources";
import { toAirportVM, toEstimateVM, toFareVM } from "./application/to-fare-vm";
import { readStoredRules } from "./pricing/rules";
import type { CatalogFacade } from "./api";

function isVisible(row: { published: boolean; validFrom: Date; validUntil: Date }, now = new Date()) {
  return row.published && row.validFrom <= now && row.validUntil > now;
}

/** `fetch` is for tests: the place-photo sources (Wikidata, Commons, Pexels) answered by fixtures. */
export const catalogModule = (
  opts: { fetch?: Fetch } = {},
): ModuleDescriptor<Record<string, never>, CatalogFacade> => ({
  name: "catalog",
  layer: "domain",
  init: ({ db, platform, env }) => {
    const conn = db as unknown as Executor;
    /** ADR-IMPL-043: place photos. On unless an operator turns the flag row off; then no photo is served or looked up. */
    const placePhotosOn = () => platform.flags.isEnabled("catalog.place_photos", true);
    const destinationsCache = createDestinationsCache();
    const invalidateMaps = async () => {
      destinationsCache.clear();
      await platform.cache.bump("catalog:dest:gen");
      await platform.cache.bump("catalog:airports:gen");
    };
    /** One rule for the search and for the quote request that follows it (ADR-IMPL-037, ADR-IMPL-042): the company's
     *  formula, when estimates are on and this environment holds valid rules. Both flag rows are cached (~35 s to reach
     *  every replica) and a failed read counts as off; without valid rules there is no estimate, never an error. */
    async function estimateRules(metric: "search" | "request") {
      if (!(await platform.flags.isEnabled("catalog.estimates", false))) return null;
      const stored = readStoredRules(await platform.flags.read("catalog.pricing_rules"));
      if (!stored.ok) {
        platform.metrics.inc(`${metric}_estimates_unavailable`, { reason: stored.reason });
        return null;
      }
      return stored;
    }

    async function indicativeEstimate(
      from: Parameters<typeof toEstimateVM>[1],
      to: Parameters<typeof toEstimateVM>[2],
      cabin: "business" | "first",
    ): Promise<ReturnType<typeof toEstimateVM>> {
      const stored = await estimateRules("search");
      if (!stored) return null;
      const estimate = toEstimateVM(stored.rules, from, to, cabin);
      if (estimate) platform.metrics.inc("search_estimates_shown", { cabin });
      return estimate;
    }

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
      indicativeFor: async (exec, q) => {
        // The cached flag rows first: with estimates off (production today) or no valid rules, the question costs no
        // query. The request module counts what it stores (`request_estimates_stored`), after its insert.
        const stored = await estimateRules("request");
        if (!stored) return null;
        const from = q.from.toUpperCase();
        const to = q.to.toUpperCase();
        const e = exec ?? conn;
        const [airports, rows] = await Promise.all([
          airportsRepo.getMany(e, [from, to]),
          faresRepo.search(e, { from, to, cabin: q.cabin }),
        ]);
        const fromApt = airports.find((a) => a.code === from);
        const toApt = airports.find((a) => a.code === to);
        // Published fares always win: the search showed them, not an estimate.
        if (!fromApt || !toApt || rows.length > 0) return null;
        const estimate = toEstimateVM(stored.rules, fromApt, toApt, q.cabin);
        return estimate ? { ...estimate, rules: stored.fingerprint } : null;
      },
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
        // with a date, the route may have fares on other days, and published fares always win. The flag rows are read
        // only then, so searches with fares cost nothing extra. The rules are not in the repository: each environment
        // holds them in `catalog.pricing_rules` (scripts/load-pricing-rules.ts).
        const estimate = items.length === 0 && !when ? await indicativeEstimate(fromApt, toApt, cabin) : null;
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

    // ADR-IMPL-039: "Popular from <city>" — searched routes first, then the hubs; names only. Cached 5 minutes with the
    // airports' generation (an import refreshes it); without Redis, three small queries.
    registerRoute("GET", "/v1/airports/popular", "fares:read", "read");
    routes.get(
      "/airports/popular",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const from = (c.req.query("from") ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(from)) return c.json(apiError("VALIDATION", { message: "from (IATA) required" }), 400);
        const origin = await airportsRepo.get(conn, from);
        if (!origin) return c.json(apiError("NOT_FOUND", { message: "unknown airport" }), 404);
        const gen = await platform.cache.generation("catalog:airports:gen");
        const picked =
          gen == null
            ? await popularFrom(conn, origin)
            : await platform.cache.getOrLoad(`catalog:popular:${gen}:${from}`, 300, () => popularFrom(conn, origin));
        platform.metrics.inc("popular_destinations_shown", { source: "searches" }, picked.fromSearches);
        platform.metrics.inc(
          "popular_destinations_shown",
          { source: "hubs" },
          picked.destinations.length - picked.fromSearches,
        );
        return c.json({ from: toAirportVM(origin), destinations: picked.destinations.map((a) => toAirportVM(a)) });
      },
    );

    // ADR-IMPL-039: the home airport suggested at onboarding, from the phone's time zone.
    registerRoute("GET", "/v1/airports/home-suggestion", "fares:read", "read");
    routes.get(
      "/airports/home-suggestion",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const zones = homeZones(c.req.query("tz") ?? "");
        if (!zones) return c.json(apiError("VALIDATION", { message: "tz must be an IANA time zone" }), 400);
        const airport = zones.length > 0 ? await discoveryRepo.busiestIn(conn, zones) : null;
        return c.json({ airport: airport ? toAirportVM(airport) : null });
      },
    );

    // ADR-IMPL-043: the photo for each city asked about — a photograph's addresses and credit, a satellite view's
    // centre, or nothing yet. Airports never asked about before get a row the resolve-place-photos job fills.
    registerRoute("GET", "/v1/places/photos", "fares:read", "read");
    routes.get(
      "/places/photos",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const codes = parseCodes(c.req.query("codes"));
        if (!codes) {
          return c.json(
            apiError("VALIDATION", { message: `codes: 1 to ${PLACE_PHOTOS_MAX_CODES} IATA codes, comma-separated` }),
            400,
          );
        }
        if (!(await placePhotosOn())) return c.json({ items: [] satisfies PlacePhotoVM[] });
        const rows = await placePhotosRepo.getMany(conn, codes);
        const known = new Map(rows.map((r) => [r.code.trim(), toPlacePhotoVM(r)]));
        const added = new Set(
          await placePhotosRepo.addPending(
            conn,
            codes.filter((code) => !known.has(code)),
          ),
        );
        if (added.size > 0) platform.metrics.inc("place_photos_requested", {}, added.size);
        const items = codes.flatMap((code): PlacePhotoVM[] => {
          const vm = known.get(code);
          if (vm) return [vm];
          return added.has(code) ? [{ code, kind: "none" }] : [];
        });
        return c.json({ items });
      },
    );

    // ADR-IMPL-043: an operator's own photo for a city (a wrong or poor one found automatically): it replaces what the
    // job found, never expires, and DELETE hands the city back to the job.
    registerRoute("PUT", "/v1/internal/places/:code/photo", "catalog:import");
    routes.put(
      "/internal/places/:code/photo",
      authorize("catalog:import", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const code = c.req.param("code").toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) return c.json(apiError("VALIDATION", { message: "code (IATA) required" }), 400);
        const parsed = PlacePhotoOverride.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        if (!(await airportsRepo.get(conn, code))) {
          return c.json(apiError("NOT_FOUND", { message: "unknown airport" }), 404);
        }
        const { card, hero, credit } = parsed.data;
        const row = await placePhotosRepo.setOverride(conn, code, {
          cardUrl: card,
          heroUrl: hero,
          author: credit?.author ?? null,
          license: credit?.license ?? null,
          link: credit?.link ?? null,
        });
        return c.json(toPlacePhotoVM(row));
      },
    );

    registerRoute("DELETE", "/v1/internal/places/:code/photo", "catalog:import");
    routes.delete(
      "/internal/places/:code/photo",
      authorize("catalog:import", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const code = c.req.param("code").toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) return c.json(apiError("VALIDATION", { message: "code (IATA) required" }), 400);
        if (!(await placePhotosRepo.clearOverride(conn, code))) {
          return c.json(apiError("NOT_FOUND", { message: "no operator photo for this airport" }), 404);
        }
        return c.body(null, 204);
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
        {
          // ADR-IMPL-043: ten due airports a minute — new ones first. Nothing due: one query, no request outside.
          name: "resolve-place-photos",
          spec: {
            cron: "* * * * *",
            singleton: true,
            timeoutMs: 50_000,
            handler: async (ctx) => {
              if (!(await placePhotosOn())) return { skipped: 1 };
              return resolvePlacePhotos({
                db: conn,
                sources: {
                  fetch: opts.fetch ?? fetch,
                  // Wikimedia's User-Agent policy: who is asking, and where to reach them.
                  userAgent: `BBCClub/1.0 (${env.APP_ORIGIN}; place photos)`,
                  signal: (ctx as { signal?: AbortSignal }).signal ?? platform.signal,
                },
                pexelsKey: env.PEXELS_API_KEY,
                metrics: platform.metrics,
                logger: platform.logger,
              });
            },
          },
        },
      ],
    };
  },
});
