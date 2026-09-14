import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { onMemberRegistered, reconcileMissingProfiles } from "./handlers/on-member-registered";

type Ports = {
  crm: {
    findByEmail(
      emailNormalized: string,
    ): Promise<{ crmClientId: string; fullName?: string; homeAirport?: string } | null>;
  };
};
/** stage 1 adds: getProfile, updateProfile, setPreferences, getStatus, timezoneOf. */
type Exposes = Record<string, never>;

export const membersModule = (): ModuleDescriptor<Ports, Exposes> => ({
  name: "members",
  layer: "core",
  needs: ["crm"],
  init: ({ db, platform, ports }) => ({
    exposes: {},
    routes: [], // stage 1: GET/PATCH /v1/profile
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
      // stage 1: member.deleted → delete the profile; crm.mirror.synced → link waitlist members
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
              publish: (e: any) =>
                db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "members" })),
            }),
          }),
        },
      },
    ],
  }),
});
