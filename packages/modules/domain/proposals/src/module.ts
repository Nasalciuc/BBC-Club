import type { Executor } from "@bbc/db";
import { Hono } from "hono";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import type { Principal } from "@bbc/shared/authz/principal";
import { offersRepo } from "./infrastructure/offers.repo";
import { ingest, IngestInput } from "./application/ingest";
import { expireOffers } from "./application/expire-offers";
import { withdraw } from "./application/withdraw";
import { onMemberDeleted } from "./handlers/on-member-deleted";

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
  withdraw(offerId: string, reason?: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_ACTIVE" }>;
};

export const proposalsModule = (): ModuleDescriptor<Record<string, never>, Exposes> => ({
  name: "proposals",
  layer: "domain",
  init: ({ db, platform }) => {
    const events = {
      publish: (
        tx: Executor,
        e: {
          type: string;
          version: number;
          aggregateType: string;
          aggregateId: string;
          memberId?: string | null;
          payload: unknown;
        },
      ) => platform.events.publish(tx, { ...e, publishedBy: "proposals" }),
    };
    const expose: Exposes = {
      getVisible: (exec, actor, id) => offersRepo.getVisible((exec ?? db) as any, actor, id),
      feed: (exec, actor, cursor, limit) => offersRepo.feed((exec ?? db) as any, actor, cursor, limit),
      getAny: (exec, id) => offersRepo.getAny((exec ?? db) as any, id),
      ingest: (input, key) => ingest({ db, events }, IngestInput.parse(input), key),
      withdraw: (offerId, reason) => withdraw({ db, events }, offerId, reason),
    };

    const routes = new Hono<{ Variables: { principal: Principal } }>();

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

    registerRoute("POST", "/v1/internal/offers/:id/withdraw", "proposals:withdraw");
    routes.post(
      "/internal/offers/:id/withdraw",
      authorize("proposals:withdraw", {
        module: "proposals",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const id = c.req.param("id");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return c.json(apiError("NOT_FOUND"), 404);
        }
        const body = (await c.req.json().catch(() => ({}))) as { reason?: unknown };
        const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined;
        const r = await expose.withdraw(id, reason);
        if (!r.ok) return c.json(apiError("NOT_FOUND"), 404);
        return c.json({ ok: true });
      },
    );

    return {
      exposes: expose,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [
        {
          type: "member.deleted",
          name: "proposals.onMemberDeleted",
          handler: (ctx: HandlerContext) => {
            const memberId = ctx.event.memberId;
            if (!memberId) return Promise.resolve();
            return onMemberDeleted({ tx: ctx.tx, memberId });
          },
        },
      ],
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
