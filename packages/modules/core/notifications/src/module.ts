import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { OfferRespondedV1 } from "@bbc/shared/events/offer";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import { notificationsTable, deviceTokens } from "@bbc/db/schema/notifications";
import type { PushSender } from "./ports/push";
import { notificationsRepo } from "./infrastructure/notifications.repo";
import { markRead } from "./application/mark-read";

type Exposes = {
  inbox(exec: unknown, actorMemberId: string, limit?: number): Promise<unknown[]>;
  unreadCount(exec: unknown, actorMemberId: string): Promise<number>;
  markRead(exec: unknown, actorMemberId: string, id: string): Promise<number>;
};

/** needs: [] for now — quieter hours / consent at dispatch land with stage 3 push. */
export const notificationsModule = (_push?: PushSender): ModuleDescriptor<Record<string, never>, Exposes> => ({
  name: "notifications",
  layer: "core",
  init: ({ db, platform }) => {
    const routes = new Hono<any>();
    registerRoute("POST", "/v1/inbox/:id/read", "inbox:mark-read");
    routes.post(
      "/inbox/:id/read",
      authorize("inbox:mark-read", {
        module: "notifications",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const r = await markRead(db, c.get("principal"), c.req.param("id"));
        if (r === "ok") return c.json({ ok: true });
        return c.json(apiError(r === "not_found" ? "NOT_FOUND" : "FORBIDDEN"), r === "not_found" ? 404 : 403);
      },
    );

    return {
      exposes: {
        inbox: (exec, actor, limit) => notificationsRepo.inbox((exec ?? db) as any, actor, limit),
        unreadCount: (exec, actor) => notificationsRepo.unreadCount((exec ?? db) as any, actor),
        markRead: (exec, actor, id) => notificationsRepo.markRead((exec ?? db) as any, actor, id),
      },
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [
        {
          type: "offer.responded",
          name: "notifications.onOfferResponded",
          handler: async (ctx: any, raw: any) => {
            const evt = OfferRespondedV1.parse(raw);
            if (evt.response !== "interested") return;
            await ctx.tx.insert(notificationsTable).values({
              memberId: evt.memberId,
              category: "transactional",
              title: "Julia will call you shortly",
              body: "Your advisor has your interest and will be in touch.",
              offerId: evt.offerId,
              status: "sent",
              sentAt: new Date(),
            });
          },
        },
        {
          type: "member.deleted",
          name: "notifications.onMemberDeleted",
          handler: async (ctx: any, raw: any) => {
            const evt = MemberDeletedV1.parse(raw);
            await ctx.tx.delete(deviceTokens).where(eq(deviceTokens.memberId, evt.memberId));
            await ctx.tx.delete(notificationsTable).where(eq(notificationsTable.memberId, evt.memberId));
          },
        },
      ],
      jobs: [],
    };
  },
});
