import { Hono } from "hono";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError, zodFieldErrors } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { RequestSubmittedV1 } from "@bbc/shared/events/request";
import type { Executor } from "@bbc/db";
import { createRequestsRepo } from "./infrastructure/requests.repo";
import { submit } from "./application/submit";
import { setStatus } from "./application/set-status";
import { toRequestVM } from "./application/to-request-vm";
import { createSendRequestsJob } from "./jobs/send-requests";
import { onMemberDeleted } from "./handlers/on-member-deleted";
import type { RequestsFacade } from "./api";
import type { CrmFacade } from "@bbc/crm";

type Ports = {
  crm: CrmFacade;
};

export const requestsModule = (): ModuleDescriptor<Ports, RequestsFacade> => ({
  name: "requests",
  layer: "domain",
  needs: ["crm"],
  init: ({ db, platform, ports }) => {
    const conn = db as unknown as Executor;
    const repo = createRequestsRepo(conn);
    const publish = async (
      tx: Executor,
      e: {
        type: string;
        version: number;
        aggregateType: string;
        aggregateId: string;
        memberId: string | null;
        payload: unknown;
      },
    ): Promise<void> => {
      await platform.events.publish(tx, { ...e, publishedBy: "requests" });
    };
    const expose = facade(conn, repo);

    const routes = new Hono<AppEnv>();

    registerRoute("POST", "/v1/requests", "requests:create");
    routes.post(
      "/requests",
      authorize("requests:create", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const key = c.req.header("Idempotency-Key");
        if (!key) return c.json(apiError("VALIDATION", { message: "Idempotency-Key is required" }), 400);

        const principal = c.get("principal");
        const platformHdr = (c.req.header("X-App-Platform") ?? "ios").toLowerCase();
        const actor = {
          memberId: actorMemberId(principal),
          source: (platformHdr === "android" ? "android" : "ios") as "ios" | "android",
          appVersion: c.req.header("X-App-Version") ?? null,
          ip: c.get("clientIp"),
        };

        const body = await c.req.json().catch(() => ({}));
        let result;
        try {
          result = await submit(conn, body, actor, key, { publish });
        } catch (err: unknown) {
          const details = zodFieldErrors(err);
          if (details) return c.json(apiError("VALIDATION", { details }), 400);
          throw err;
        }
        if (!result.ok) {
          if (result.code === "RATE_LIMITED") return c.json(apiError("RATE_LIMITED"), 429);
          if (result.code === "CONFLICT") return c.json(apiError("CONFLICT"), 409);
          return c.json(apiError("VALIDATION"), 400);
        }
        return c.json(toRequestVM(result.request), result.created ? 201 : 200);
      },
    );

    registerRoute("GET", "/v1/requests", "requests:read-self");
    routes.get(
      "/requests",
      authorize("requests:read-self", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const memberId = actorMemberId(c.get("principal"));
        if (!memberId) return c.json(apiError("FORBIDDEN"), 403);
        const rows = await repo.listForMember(undefined, memberId);
        const page = rows.slice(0, 50);
        const timelines = await repo.timelinesFor(
          undefined,
          page.map((r) => r.id),
        );
        return c.json({
          items: page.map((r) => toRequestVM(r, timelines.get(r.id) ?? [])),
          hasMore: rows.length > 50,
        });
      },
    );

    registerRoute("GET", "/v1/requests/:id", "requests:read-self");
    routes.get(
      "/requests/:id",
      authorize("requests:read-self", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const memberId = actorMemberId(c.get("principal"));
        if (!memberId) return c.json(apiError("FORBIDDEN"), 403);
        const row = await repo.getForMember(undefined, memberId, c.req.param("id"));
        if (!row) return c.json(apiError("NOT_FOUND"), 404);
        const timeline = await repo.timeline(undefined, row.id);
        return c.json(toRequestVM(row, timeline));
      },
    );

    registerRoute("POST", "/v1/internal/requests/:id/status", "requests:update-any");
    routes.post(
      "/internal/requests/:id/status",
      authorize("requests:update-any", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const body = await c.req.json().catch(() => ({}));
        let r;
        try {
          r = await setStatus(conn, { ...body, requestId: c.req.param("id") }, { repo, publish });
        } catch (err: unknown) {
          const details = zodFieldErrors(err);
          if (details) return c.json(apiError("VALIDATION", { details }), 400);
          throw err;
        }
        if (!r.ok) return c.json(apiError("NOT_FOUND"), 404);
        return c.json({ ok: true, unchanged: r.unchanged });
      },
    );

    return {
      exposes: expose,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [
        {
          type: "request.submitted",
          name: "requests.onRequestSubmitted",
          /** Records that the request is ready to send. The network call belongs to `send-requests`, which owns
           *  its own connection, its own timeout and its own retry budget. A consumer holds the poller's
           *  transaction: anything slow in here is a connection the rest of the API cannot have. */
          handler: async (ctx: HandlerContext, raw: unknown) => {
            const evt = RequestSubmittedV1.parse(raw);
            ctx.logger.info({ requestId: evt.requestId }, "request queued for CRM");
          },
        },
        {
          type: "member.deleted",
          name: "requests.onMemberDeleted",
          handler: (ctx: HandlerContext) => {
            const memberId = ctx.event.memberId;
            if (!memberId) return Promise.resolve();
            return onMemberDeleted({ tx: ctx.tx, memberId });
          },
        },
      ],
      jobs: [
        {
          name: "send-requests",
          spec: {
            cron: "* * * * *",
            singleton: true,
            timeoutMs: 60_000,
            handler: createSendRequestsJob({
              db: conn,
              repo,
              crm: ports.crm,
              logger: platform.logger,
            }),
          },
        },
      ],
    };
  },
});

function facade(db: Executor, repo: ReturnType<typeof createRequestsRepo>): RequestsFacade {
  return {
    listForMember: (exec, memberId) => repo.listForMember(exec ?? db, memberId),
    get: (exec, memberId, id) => repo.getForMember(exec ?? db, memberId, id),
  };
}
