import { Hono } from "hono";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import { offersRepo } from "./infrastructure/offers.repo";
import { ingest, IngestInput } from "./application/ingest";
import { expireOffers } from "./application/expire-offers";

type Exposes = {
  getVisible(exec: unknown, actorMemberId: string, offerId: string): Promise<unknown | null>;
  getAny(exec: unknown, offerId: string): Promise<unknown | null>;
  feed(
    exec: unknown,
    actorMemberId: string,
    cursor: { ts: Date; id: string } | null,
    limit?: number,
  ): Promise<unknown[]>;
  ingest(
    input: unknown,
    idempotencyKey: string,
  ): Promise<{ ok: true; offerId: string } | { ok: false; code: "CONFLICT" | "BAD_KEY" }>;
};

export const proposalsModule = (): ModuleDescriptor<Record<string, never>, Exposes> => ({
  name: "proposals",
  layer: "domain",
  init: ({ db, platform }) => {
    const events = {
      publish: (tx: any, e: any) => platform.events.publish(tx, { ...e, publishedBy: "proposals" }),
    };
    const expose: Exposes = {
      getVisible: (exec, actor, id) => offersRepo.getVisible((exec ?? db) as any, actor, id),
      feed: (exec, actor, cursor, limit) => offersRepo.feed((exec ?? db) as any, actor, cursor, limit),
      getAny: (exec, id) => offersRepo.getAny((exec ?? db) as any, id),
      ingest: (input, key) => ingest({ db, events }, IngestInput.parse(input), key),
    };

    const routes = new Hono<any>();

    registerRoute("POST", "/v1/internal/offers", "proposals:ingest");
    routes.post(
      "/internal/offers",
      authorize("proposals:ingest", {
        module: "proposals",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const key = c.req.header("Idempotency-Key") ?? "";
        const parsed = IngestInput.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        const r = await expose.ingest(parsed.data, key);
        if (!r.ok) {
          if (r.code === "BAD_KEY") return c.json(apiError("VALIDATION", { message: "Idempotency-Key required" }), 400);
          return c.json(apiError("CONFLICT"), 409);
        }
        return c.json({ offerId: r.offerId });
      },
    );

    return {
      exposes: expose,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [],
      jobs: [
        {
          name: "expire-offers",
          spec: {
            /** Cron: every 5 minutes. Idempotent — safe to run on multiple replicas. */
            cron: "*/5 * * * *",
            singleton: true,
            timeoutMs: 30_000,
            handler: async () => expireOffers({ db, events }),
          },
        },
      ],
    };
  },
});
