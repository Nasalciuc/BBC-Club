import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import type { Executor } from "@bbc/db";
import type { JobContext } from "@bbc/platform";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import { RequestStatusChangedV1 } from "@bbc/shared/events/request";
import { notificationsTable, deviceTokens } from "@bbc/db/schema/notifications";
import { notificationsRepo } from "./infrastructure/notifications.repo";
import { devicesRepo } from "./infrastructure/devices.repo";
import { markRead } from "./application/mark-read";
import { dispatch } from "./application/dispatch";
import { reconcileReceipts } from "./application/receipts";
import { cleanupDevices } from "./application/cleanup-devices";
import { onOfferPublished } from "./handlers/on-offer-published";
import { onOfferExpired, onOfferWithdrawn } from "./handlers/on-offer-lifecycle";
import { DeviceBody } from "@bbc/shared/api/v1/proposals";
import type { NotificationsFacade } from "./api";
import type { MembersFacade } from "@bbc/members";
import type { PushFacade } from "@bbc/push";

type Ports = {
  members: MembersFacade;
  push: PushFacade;
};

export const notificationsModule = (): ModuleDescriptor<Ports, NotificationsFacade> => ({
  name: "notifications",
  layer: "core",
  needs: ["members", "push"],
  init: ({ db, platform, ports }) => {
    const conn = db as unknown as Executor;
    const routes = new Hono<AppEnv>();
    const publish = (
      tx: Executor,
      e: {
        type: string;
        version: number;
        aggregateType: string;
        aggregateId: string;
        memberId?: string | null;
        payload: unknown;
      },
    ) => platform.events.publish(tx, { ...e, publishedBy: "notifications" });

    registerRoute("GET", "/v1/inbox", "inbox:read");
    routes.get(
      "/inbox",
      authorize("inbox:read", {
        module: "notifications",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const [items, unreadCount] = await Promise.all([
          notificationsRepo.inbox(conn, actor),
          notificationsRepo.unreadCount(conn, actor),
        ]);
        const vms = (
          items as {
            id: string;
            title: string;
            body: string | null;
            deepLink: string | null;
            offerId: string | null;
            category: string;
            readAt: Date | null;
            createdAt: Date;
          }[]
        ).map((n) => ({
          id: n.id,
          title: n.title,
          ...(n.body ? { body: n.body } : {}),
          ...(n.deepLink ? { deepLink: n.deepLink } : {}),
          ...(n.offerId ? { offerId: n.offerId } : {}),
          category: n.category,
          read: n.readAt !== null,
          createdAt: (n.createdAt as Date).toISOString(),
        }));
        return c.json({ items: vms, unreadCount });
      },
    );

    registerRoute("POST", "/v1/inbox/:id/read", "inbox:mark-read");
    routes.post(
      "/inbox/:id/read",
      authorize("inbox:mark-read", {
        module: "notifications",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const r = await markRead(conn, c.get("principal"), c.req.param("id"));
        if (r === "ok") return c.json({ ok: true });
        return c.json(apiError(r === "not_found" ? "NOT_FOUND" : "FORBIDDEN"), r === "not_found" ? 404 : 403);
      },
    );

    registerRoute("POST", "/v1/devices", "devices:register");
    routes.post(
      "/devices",
      authorize("devices:register", {
        module: "notifications",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const parsed = DeviceBody.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        await devicesRepo.register(conn, actor, parsed.data);
        return c.json({ ok: true }, 201);
      },
    );

    registerRoute("DELETE", "/v1/devices/:deviceId", "devices:unregister");
    routes.delete(
      "/devices/:deviceId",
      authorize("devices:unregister", {
        module: "notifications",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const ok = await devicesRepo.deactivate(conn, actor, c.req.param("deviceId"));
        if (!ok) return c.json(apiError("NOT_FOUND"), 404);
        return c.json({ ok: true });
      },
    );

    return {
      exposes: {
        inbox: (exec, actor, limit) => notificationsRepo.inbox((exec ?? conn) as Executor, actor, limit),
        unreadCount: (exec, actor) => notificationsRepo.unreadCount((exec ?? conn) as Executor, actor),
        markRead: (exec, actor, id) => notificationsRepo.markRead((exec ?? conn) as Executor, actor, id),
      } satisfies NotificationsFacade,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [
        {
          type: "offer.published",
          name: "notifications.onOfferPublished",
          handler: (ctx: HandlerContext, raw: unknown) =>
            onOfferPublished({ tx: ctx.tx, members: ports.members, sourceEventId: String(ctx.event.id) }, raw),
        },
        {
          type: "offer.withdrawn",
          name: "notifications.onOfferWithdrawn",
          handler: (ctx: HandlerContext, raw: unknown) => onOfferWithdrawn({ tx: ctx.tx }, raw),
        },
        {
          type: "offer.expired",
          name: "notifications.onOfferExpired",
          handler: (ctx: HandlerContext, raw: unknown) => onOfferExpired({ tx: ctx.tx }, raw),
        },
        {
          type: "request.status_changed",
          name: "notifications.onRequestStatusChanged",
          handler: async (ctx: HandlerContext, raw: unknown) => {
            const evt = RequestStatusChangedV1.parse(raw);
            if (evt.to !== "quoted" || !evt.memberId) return;
            const body = `${evt.route ?? "Your trip"} — tap to call your specialist`;
            const deepLink = `bbcclub://requests/${evt.requestId}`;
            await ctx.tx.execute(sql`
              INSERT INTO notifications.notifications
                (member_id, category, title, body, deep_link, request_id, source_event_id, status, scheduled_for)
              VALUES
                (${evt.memberId}, 'transactional', 'Your quote is ready', ${body}, ${deepLink},
                 ${evt.requestId}::uuid, ${String(ctx.event.id)}, 'pending', now())
              ON CONFLICT (member_id, request_id, category) WHERE request_id IS NOT NULL
              DO NOTHING`);
          },
        },
        {
          type: "member.deleted",
          name: "notifications.onMemberDeleted",
          handler: async (ctx: HandlerContext, raw: unknown) => {
            const evt = MemberDeletedV1.parse(raw);
            await ctx.tx.delete(deviceTokens).where(eq(deviceTokens.memberId, evt.memberId));
            await ctx.tx.delete(notificationsTable).where(eq(notificationsTable.memberId, evt.memberId));
          },
        },
      ],
      jobs: [
        {
          name: "dispatch",
          spec: {
            cron: "* * * * *",
            singleton: true,
            timeoutMs: 55_000,
            handler: async (ctx: JobContext) =>
              dispatch({
                db: conn,
                push: ports.push,
                members: ports.members,
                publish,
                signal: ctx.signal,
              }),
          },
        },
        {
          name: "receipts",
          spec: {
            cron: "15 * * * *",
            singleton: true,
            timeoutMs: 30_000,
            handler: async () => reconcileReceipts(conn),
          },
        },
        {
          name: "cleanup-devices",
          spec: {
            cron: "0 4 * * *",
            singleton: true,
            timeoutMs: 60_000,
            handler: async () => cleanupDevices(conn),
          },
        },
      ],
    };
  },
});
