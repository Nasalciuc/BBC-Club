import type { Executor } from "@bbc/db";
import { Hono } from "hono";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { offersRepo } from "./infrastructure/offers.repo";
import { ingest, IngestInput } from "./application/ingest";
import { expireOffers } from "./application/expire-offers";
import { withdraw } from "./application/withdraw";
import { onMemberDeleted } from "./handlers/on-member-deleted";
import type { ProposalsFacade } from "./api";

/** The SQLSTATE and constraint of a failed query: on drizzle's wrapper's cause, or on postgres-js's error itself. */
function pgError(err: unknown): { code?: string; constraint?: string } {
  const e = err as { code?: unknown; constraint_name?: unknown; cause?: { code?: unknown; constraint_name?: unknown } };
  const src = e?.cause && typeof e.cause === "object" ? e.cause : e;
  return {
    code: typeof src?.code === "string" ? src.code : undefined,
    constraint: typeof src?.constraint_name === "string" ? src.constraint_name : undefined,
  };
}

export const proposalsModule = (): ModuleDescriptor<Record<string, never>, ProposalsFacade> => ({
  name: "proposals",
  layer: "domain",
  init: ({ db, platform }) => {
    const conn = db as unknown as Executor;
    const events = {
      publish: async (
        tx: Executor,
        e: {
          type: string;
          version: number;
          aggregateType: string;
          aggregateId: string;
          memberId?: string | null;
          payload: unknown;
        },
      ): Promise<void> => {
        await platform.events.publish(tx, { ...e, publishedBy: "proposals" });
      },
    };
    const expose: ProposalsFacade = {
      getVisible: (exec, actor, id) => offersRepo.getVisible(exec ?? conn, actor, id),
      feed: (exec, actor, cursor, limit) => offersRepo.feed(exec ?? conn, actor, cursor, limit),
      getAny: (exec, id) => offersRepo.getAny(exec ?? conn, id),
      ingest: (input, key) => ingest({ db: conn, events }, IngestInput.parse(input), key),
      withdraw: (offerId, reason) => withdraw({ db: conn, events }, offerId, reason),
    };

    const routes = new Hono<AppEnv>();

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
        let r: Awaited<ReturnType<typeof expose.ingest>>;
        try {
          r = await expose.ingest(parsed.data, key);
        } catch (err) {
          // A rule of the offers table the schema above does not mirror yet: the payload is at fault, and a 500 would
          // have the at-least-once CRM retry it for ever. The constraint's name, never the query's values.
          const pg = pgError(err);
          if (pg.code === "23514" || pg.code === "22003") {
            return c.json(
              apiError("VALIDATION", {
                message: pg.constraint ? `refused by ${pg.constraint}` : "a value is out of range",
              }),
              400,
            );
          }
          throw err;
        }
        if (!r.ok) {
          if (r.code === "BAD_KEY") return c.json(apiError("VALIDATION", { message: "Idempotency-Key required" }), 400);
          if (r.code === "VALIDATION") return c.json(apiError("VALIDATION", { message: r.message }), 400);
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
            return onMemberDeleted({ tx: ctx.tx as unknown as Executor, memberId });
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
            handler: async () => expireOffers({ db: conn, events }),
          },
        },
      ],
    };
  },
});
