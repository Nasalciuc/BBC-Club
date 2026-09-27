import { Hono } from "hono";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { rateLimit } from "@bbc/platform/ratelimit";
import { apiError, zodFieldErrors } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { RequestSubmittedV1 } from "@bbc/shared/events/request";
import type { Executor } from "@bbc/db";
import { createRequestsRepo } from "./infrastructure/requests.repo";
import { submit } from "./application/submit";
import { setStatus } from "./application/set-status";
import { actionLabel, escapeHtml, routeLabel, verifyAction } from "./application/operator-links";
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
  init: ({ db, platform, ports, env }) => {
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
          result = await submit(conn, body, actor, key, { publish, rateLimit: platform.rateLimit });
        } catch (err: unknown) {
          const details = zodFieldErrors(err);
          if (details) return c.json(apiError("VALIDATION", { details }), 400);
          throw err;
        }
        if (!result.ok) {
          if (result.code === "RATE_LIMITED") {
            c.header("Retry-After", String(Math.max(1, Math.ceil((result.retryAfterMs ?? 1000) / 1000))));
            return c.json(apiError("RATE_LIMITED"), 429);
          }
          if (result.code === "CONFLICT") return c.json(apiError("CONFLICT"), 409);
          return c.json(apiError("VALIDATION"), 400);
        }
        return c.json(toRequestVM(result.request), result.created ? 201 : 200);
      },
    );

    registerRoute("GET", "/v1/requests", "requests:read-self", "read");
    routes.get(
      "/requests",
      rateLimit(platform.rateLimit, "read"),
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

    registerRoute("GET", "/v1/requests/:id", "requests:read-self", "read");
    routes.get(
      "/requests/:id",
      rateLimit(platform.rateLimit, "read"),
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
      routes: [
        { basePath: "/v1", app: routes },
        { basePath: "/ops", app: opsRoutes(conn, repo, publish, platform, env.OPS_LINK_SECRET ?? "") },
      ],
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

type OpsPublish = (
  tx: Executor,
  e: {
    type: string;
    version: number;
    aggregateType: string;
    aggregateId: string;
    memberId: string | null;
    payload: unknown;
  },
) => Promise<void>;

function opsRoutes(
  conn: Executor,
  repo: ReturnType<typeof createRequestsRepo>,
  publish: OpsPublish,
  platform: { rateLimit: Parameters<typeof rateLimit>[0] },
  secret: string,
) {
  const ops = new Hono<AppEnv>();
  const limit = rateLimit(platform.rateLimit, "ops.link", (c) => `ip:${c.get("clientIp") ?? "unknown"}`);

  registerRoute("GET", "/ops/requests/:token", "public", "ops.link");
  ops.get("/requests/:token", limit, async (c) => {
    const v = verifyAction(secret, c.req.param("token"));
    if (!v.ok) {
      return c.html(
        page(v.reason === "expired" ? "This link has expired." : "This link is not valid."),
        v.reason === "expired" ? 410 : 403,
      );
    }
    const req = await repo.getById(conn, v.requestId);
    if (!req) return c.html(page("Request not found."), 404);
    return c.html(
      confirmPage({
        token: c.req.param("token"),
        action: v.action,
        reference: req.reference,
        route: routeLabel(req.legs),
        name: req.contactName,
      }),
    );
  });

  registerRoute("POST", "/ops/requests/:token", "public", "ops.link");
  ops.post("/requests/:token", limit, async (c) => {
    const v = verifyAction(secret, c.req.param("token"));
    if (!v.ok) return c.html(page("This link is not valid or has expired."), 403);
    const r = await setStatus(conn, { requestId: v.requestId, status: v.action, agentId: "ops" }, { repo, publish });
    if (!r.ok) return c.html(page("Request not found."), 404);
    return c.html(page(r.unchanged ? "Already marked — nothing changed." : `Marked as ${actionLabel(v.action)}.`));
  });

  return ops;
}

function page(message: string): string {
  return `<!doctype html><html><body><p>${escapeHtml(message)}</p></body></html>`;
}

function confirmPage(input: {
  token: string;
  action: "quoted" | "booked" | "closed";
  reference: string;
  route: string;
  name: string;
}): string {
  return `<!doctype html><html><body><p>${escapeHtml(input.reference)}</p><p>${escapeHtml(input.route)}</p><p>${escapeHtml(input.name)}</p><form method="post" action="/ops/requests/${escapeHtml(input.token)}"><button type="submit">Mark as ${escapeHtml(actionLabel(input.action))}</button></form></body></html>`;
}

function facade(db: Executor, repo: ReturnType<typeof createRequestsRepo>): RequestsFacade {
  return {
    listForMember: (exec, memberId) => repo.listForMember(exec ?? db, memberId),
    get: (exec, memberId, id) => repo.getForMember(exec ?? db, memberId, id),
  };
}
