import { Hono } from "hono";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { airportsRepo } from "./infrastructure/airports.repo";
import { faresRepo } from "./infrastructure/fares.repo";
import { expireFares } from "./application/expire-fares";
import { importCatalog, ImportBody } from "./application/import";
import { toAirportVM, toFareVM } from "./application/to-fare-vm";

type Exposes = {
  searchFares(
    exec: unknown,
    q: { from: string; to: string; cabin: "business" | "first"; when?: Date },
  ): Promise<unknown[]>;
  getFare(exec: unknown, id: string): Promise<unknown | null>;
  destinations(exec: unknown, home: string): Promise<unknown[]>;
  searchAirports(exec: unknown, q: string): Promise<unknown[]>;
  getAirport(exec: unknown, code: string): Promise<unknown | null>;
  importCsv(input: unknown): Promise<{ imported: number }>;
};

function isVisible(row: { published: boolean; validFrom: Date; validUntil: Date }, now = new Date()) {
  return row.published && row.validFrom <= now && row.validUntil > now;
}

export const catalogModule = (): ModuleDescriptor<Record<string, never>, Exposes> => ({
  name: "catalog",
  layer: "domain",
  init: ({ db, platform }) => {
    const expose: Exposes = {
      searchFares: (exec, q) => faresRepo.search((exec ?? db) as any, q),
      getFare: (exec, id) => faresRepo.getAny((exec ?? db) as any, id),
      destinations: (exec, home) => faresRepo.destinations((exec ?? db) as any, home),
      searchAirports: (exec, q) => airportsRepo.search((exec ?? db) as any, q),
      getAirport: (exec, code) => airportsRepo.get((exec ?? db) as any, code),
      importCsv: (input) => importCatalog({ db }, ImportBody.parse(input)),
    };

    const routes = new Hono<any>();

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
          airportsRepo.get(db, from),
          airportsRepo.get(db, to),
          faresRepo.search(db, { from, to, cabin, ...(when ? { when } : {}) }),
        ]);
        if (!fromApt || !toApt) return c.json(apiError("NOT_FOUND", { message: "unknown airport" }), 404);

        const items = rows.map((r) => toFareVM(r as any, { from: fromApt, to: toApt }, false));
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
        const row = await faresRepo.getAny(db, id);
        if (!row) return c.json(apiError("NOT_FOUND"), 404);
        if (!isVisible(row as any)) return c.json(apiError("GONE"), 410);

        const [fromApt, toApt] = await Promise.all([
          airportsRepo.get(db, (row as any).routeFrom),
          airportsRepo.get(db, (row as any).routeTo),
        ]);
        if (!fromApt || !toApt) return c.json(apiError("NOT_FOUND"), 404);
        return c.json(toFareVM(row as any, { from: fromApt, to: toApt }, false));
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
        const rows = await airportsRepo.search(db, q);
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
          return c.json(r);
        } catch (e: any) {
          return c.json(apiError("VALIDATION", { message: e?.message ?? "import failed" }), 400);
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
            handler: async () => expireFares({ db }),
          },
        },
      ],
    };
  },
});
