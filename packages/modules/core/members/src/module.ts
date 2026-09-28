import { Hono } from "hono";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { rateLimit } from "@bbc/platform/ratelimit";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { createMembersFacade, toProfileVM } from "./application/facade";
import type { MembersFacade } from "./api";
import type { CrmFacade } from "@bbc/crm";
import type { IdentityFacade } from "@bbc/identity";
import { onMemberRegistered, reconcileMissingProfiles } from "./handlers/on-member-registered";
import { onMemberDeleted } from "./handlers/on-member-deleted";
import { ProfilePatchBody, NotificationPreferencesBody, TravelPreferencesBody } from "@bbc/shared/api/v1/proposals";
import { event } from "@bbc/shared/events";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import type { Principal } from "@bbc/shared/authz/principal";

type Ports = {
  crm: CrmFacade;
  identity: IdentityFacade;
};

function memberEmail(p: Principal): string | null {
  return p.kind === "member" ? p.email : null;
}

export const membersModule = (): ModuleDescriptor<Ports, MembersFacade> => ({
  name: "members",
  layer: "core",
  needs: ["crm", "identity"],
  init: ({ db, platform, ports }) => {
    const conn = db as unknown as Executor;
    const facade = createMembersFacade(conn);
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
      await platform.events.publish(tx, { ...e, publishedBy: "members" });
    };

    const routes = new Hono<AppEnv>();

    registerRoute("PATCH", "/v1/profile", "profile:update-self", "profile.write");
    routes.patch(
      "/profile",
      rateLimit(platform.rateLimit, "profile.write"),
      authorize("profile:update-self", {
        module: "members",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const parsed = ProfilePatchBody.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        const updated = await withTx(conn, async (tx) => {
          const p = await facade.updateProfile(tx, actor, parsed.data);
          if (!p) return null;
          const fields = Object.keys(parsed.data);
          await publish(tx, {
            type: "member.profile_updated",
            version: 1,
            aggregateType: "member",
            aggregateId: actor,
            memberId: actor,
            payload: event("member.profile_updated", {
              memberId: actor,
              fields,
              updatedAt: new Date().toISOString(),
            }),
          });
          return p;
        });
        if (!updated) return c.json(apiError("NOT_FOUND"), 404);
        return c.json(updated);
      },
    );

    registerRoute("PUT", "/v1/profile/travel", "profile:update-self", "profile.write");
    routes.put(
      "/profile/travel",
      rateLimit(platform.rateLimit, "profile.write"),
      authorize("profile:update-self", {
        module: "members",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const principal = c.get("principal");
        const actor = actorMemberId(principal);
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const parsed = TravelPreferencesBody.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        const updated = await withTx(conn, async (tx) => {
          const p = await facade.setTravelPreferences(tx, actor, parsed.data);
          if (!p) return null;
          await publish(tx, {
            type: "member.profile_updated",
            version: 1,
            aggregateType: "member",
            aggregateId: actor,
            memberId: actor,
            payload: event("member.profile_updated", {
              memberId: actor,
              fields: Object.keys(parsed.data),
              updatedAt: new Date().toISOString(),
            }),
          });
          return p;
        });
        if (!updated) return c.json(apiError("NOT_FOUND"), 404);
        const prefs = await facade.preferencesOf(undefined, actor);
        return c.json(toProfileVM(updated, memberEmail(principal), actor, prefs));
      },
    );

    registerRoute("PUT", "/v1/profile/preferences", "inbox:manage-preferences", "profile.write");
    routes.put(
      "/profile/preferences",
      rateLimit(platform.rateLimit, "profile.write"),
      authorize("inbox:manage-preferences", {
        module: "members",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const parsed = NotificationPreferencesBody.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        await facade.setNotificationPreferences(undefined, actor, parsed.data.preferences);
        return c.json({ ok: true });
      },
    );

    return {
      exposes: facade,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [
        {
          type: "member.registered",
          name: "members.onMemberRegistered",
          handler: (ctx: HandlerContext, payload: unknown) =>
            onMemberRegistered(
              {
                tx: ctx.tx as unknown as Executor,
                crm: ports.crm,
                // ADR-PROD-001: seeded false by scripts/seed-flags.ts — an unknown CRM email is waitlist.
                flags: { get: (k: string) => platform.flags.isEnabled(k, false) },
                publish: async (e) => {
                  await platform.events.publish(ctx.tx, { ...e, publishedBy: "members" });
                },
              },
              payload,
            ),
        },
        {
          type: "member.deleted",
          name: "members.onMemberDeleted",
          handler: (ctx: HandlerContext, payload: unknown) =>
            onMemberDeleted({ tx: ctx.tx as unknown as Executor }, payload),
        },
        // stage 1: crm.mirror.synced → link waitlist members
      ],
      jobs: [
        {
          name: "reconcile-profiles",
          spec: {
            cron: "*/15 * * * *",
            singleton: true,
            timeoutMs: 120_000,
            handler: async () => ({
              reemitted: await reconcileMissingProfiles({
                db: conn,
                identity: ports.identity,
                publish: async (e) => {
                  await db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "members" }));
                },
              }),
            }),
          },
        },
      ],
    };
  },
});
