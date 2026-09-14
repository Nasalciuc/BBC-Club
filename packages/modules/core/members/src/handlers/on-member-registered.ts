import { MemberRegisteredV1 } from "@bbc/shared/events/member";
import { event } from "@bbc/shared/events";
import { profile } from "@bbc/db/schema/members";
import { inArray } from "drizzle-orm";

/** Creates the profile and links it to the CRM mirror. Idempotent: platform.event_inbox gates re-delivery,
 *  and the insert is ON CONFLICT DO NOTHING on the primary key. */
export async function onMemberRegistered(
  deps: {
    tx: any; // Drizzle transaction from the poller
    crm: {
      findByEmail(
        emailNormalized: string,
      ): Promise<{ crmClientId: string; fullName?: string; homeAirport?: string } | null>;
    };
    flags: { get(key: string): Promise<boolean> };
    publish: (evt: {
      type: string;
      version: number;
      aggregateType: string;
      aggregateId: string;
      memberId: string;
      payload: unknown;
    }) => Promise<void>;
  },
  raw: unknown,
) {
  const evt = MemberRegisteredV1.parse(raw);
  const match = await deps.crm.findByEmail(evt.emailNormalized);
  // ADR-PROD-001: v1 keeps this flag off — unknown CRM email is waitlist, never active.
  const openSignups = await deps.flags.get("members.allow_non_crm_signups");
  const status = match ? "active" : openSignups ? "active" : "waitlist";

  await deps.tx
    .insert(profile)
    .values({
      memberId: evt.memberId,
      crmClientId: match?.crmClientId ?? null,
      linkedAt: match ? new Date() : null,
      displayName: match?.fullName ?? null,
      homeAirport: match?.homeAirport ?? null,
      status,
    })
    .onConflictDoNothing({ target: profile.memberId });

  if (match) {
    await deps.publish({
      type: "member.linked_to_crm",
      version: 1,
      aggregateType: "member",
      aggregateId: evt.memberId,
      memberId: evt.memberId,
      payload: event("member.linked_to_crm", {
        memberId: evt.memberId,
        crmClientId: match.crmClientId,
        linkedAt: new Date().toISOString(),
      }),
    });
  }
}

export type IdentityUsersPort = {
  listUsersCreatedBefore(before: Date): Promise<{ id: string; email: string; createdAt: Date }[]>;
};

/** Nightly: the identity hook publishes after Better Auth's insert, outside its transaction. If the event was
 *  lost, the member has an auth user and no profile. Diff in memory — no cross-schema SQL. */
export async function reconcileMissingProfiles(deps: {
  db: any;
  identity: IdentityUsersPort;
  publish: (e: any) => Promise<void>;
}) {
  const users = await deps.identity.listUsersCreatedBefore(new Date(Date.now() - 5 * 60_000));
  if (users.length === 0) return 0;
  const rows: { id: string }[] = await deps.db
    .select({ id: profile.memberId })
    .from(profile)
    .where(
      inArray(
        profile.memberId,
        users.map((u) => u.id),
      ),
    );
  const existing = new Set(rows.map((r) => r.id));
  let n = 0;
  for (const u of users) {
    if (existing.has(u.id)) continue;
    await deps.publish({
      type: "member.registered",
      version: 1,
      aggregateType: "member",
      aggregateId: u.id,
      memberId: u.id,
      payload: event("member.registered", {
        memberId: u.id,
        emailNormalized: u.email.trim().toLowerCase(),
        registeredAt: u.createdAt.toISOString(),
      }),
    });
    n++;
  }
  return n;
}
