import { Hono } from "hono";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import { createMembersFacade, type MembersFacade } from "./api";
import { onMemberRegistered, reconcileMissingProfiles, type IdentityUsersPort } from "./handlers/on-member-registered";
import { onMemberDeleted } from "./handlers/on-member-deleted";
import { ProfilePatchBody, NotificationPreferencesBody } from "@bbc/shared/api/v1/proposals";
import { event } from "@bbc/shared/events";
import { withTx } from "@bbc/db";

type Ports = {
  crm: {
    findByEmail(
      emailNormalized: string,
    ): Promise<{ crmClientId: string; fullName?: string; homeAirport?: string } | null>;
  };
  identity: IdentityUsersPort;
};
/** stage 1 adds: updateProfile, setPreferences. */
type Exposes = MembersFacade;

export const membersModule = (): ModuleDescriptor<Ports, Exposes> => ({
  name: "members",
  layer: "core",
  needs: ["crm", "identity"],
  init: ({ db, platform, ports }) => {
    const facade = createMembersFacade(db);
    const publish = (tx: any, e: any) => platform.events.publish(tx, { ...e, publishedBy: "members" });

    const routes = new Hono<any>();

    registerRoute("PATCH", "/v1/profile", "profile:update-self");
    routes.patch(
      "/profile",
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
        const updated = await withTx(db, async (tx) => {
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

    registerRoute("PUT", "/v1/profile/preferences", "inbox:manage-preferences");
    routes.put(
      "/profile/preferences",
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
          handler: (ctx: any, payload: any) =>
            onMemberRegistered(
              {
                tx: ctx.tx,
                crm: ports.crm,
                // ADR-PROD-001: seeded false by scripts/seed-flags.ts — an unknown CRM email is waitlist.
                flags: { get: (k: string) => platform.flags.isEnabled(k, false) },
                publish: (e: any) => platform.events.publish(ctx.tx, { ...e, publishedBy: "members" }),
              },
              payload,
            ),
        },
        {
          type: "member.deleted",
          name: "members.onMemberDeleted",
          handler: (ctx: any, payload: any) => onMemberDeleted({ tx: ctx.tx }, payload),
        },
        // stage 1: crm.mirror.synced → link waitlist members
      ],
      jobs: [
        {
          name: "reconcile-profiles",
          spec: {
            singleton: true,
            timeoutMs: 120_000,
            handler: async () => ({
              reemitted: await reconcileMissingProfiles({
                db,
                identity: ports.identity,
                publish: (e: any) =>
                  db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "members" })),
              }),
            }),
          },
        },
      ],
    };
  },
});
