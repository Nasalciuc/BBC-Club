import { Hono } from "hono";
import type { Db, Executor } from "@bbc/db";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { airportsRepo } from "./infrastructure/airports.repo";
import { faresRepo } from "./infrastructure/fares.repo";
import { createDestinationsCache } from "./application/destinations-cache";
import { expireFares } from "./application/expire-fares";
import { importCatalog, ImportBody } from "./application/import";
import { toAirportVM, toFareVM } from "./application/to-fare-vm";
import type { CatalogFacade } from "./api";

function isVisible(row: { published: boolean; validFrom: Date; validUntil: Date }, now = new Date()) {
  return row.published && row.validFrom <= now && row.validUntil > now;
}

export const catalogModule = (): ModuleDescriptor<Record<string, never>, CatalogFacade> => ({
  name: "catalog",
  layer: "domain",
  init: ({ db, platform }) => {
    const conn = db as unknown as Executor;
    const destinationsCache = createDestinationsCache();
    const expose: CatalogFacade = {
      searchFares: (exec, q) => faresRepo.search(exec ?? conn, q),
      getFare: (exec, id) => faresRepo.getAny(exec ?? conn, id),
      destinations: (exec, home) =>
        exec
          ? faresRepo.destinations(exec, home)
          : destinationsCache.get(home, () => faresRepo.destinations(conn, home)),
      searchAirports: (exec, q) => airportsRepo.search(exec ?? conn, q),
      getAirport: (exec, code) => airportsRepo.get(exec ?? conn, code),
      getAirports: (exec, codes) => airportsRepo.getMany(exec ?? conn, [...codes]),
      importCsv: (input) => importCatalog({ db: conn as Db }, ImportBody.parse(input)),
    };

    const routes = new Hono<AppEnv>();

    registerRoute("GET", "/v1/search", "fares:read");
    routes.get(
      "/search",
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
        return c.json({
          from: toAirportVM(fromApt),
          to: toAirportVM(toApt),
          items,
          offer: null,
        });
      },
    );

    registerRoute("GET", "/v1/fares/:id", "fares:read");
    routes.get(
      "/fares/:id",
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

    registerRoute("GET", "/v1/airports", "fares:read");
    routes.get(
      "/airports",
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const q = c.req.query("q") ?? "";
        const rows = await airportsRepo.search(conn, q);
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
          destinationsCache.clear();
          return c.json(r);
        } catch (e: unknown) {
          return c.json(apiError("VALIDATION", { message: e instanceof Error ? e.message : "import failed" }), 400);
        }
      },
    );

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
              destinationsCache.clear();
              return out;
            },
          },
        },
      ],
    };
  },
});
