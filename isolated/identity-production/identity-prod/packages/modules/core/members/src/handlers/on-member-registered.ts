import { MemberRegisteredV1 } from "@bbc/shared/events/member";
import { profile } from "@bbc/db/schema/members";
import { eq } from "drizzle-orm";

/** Creates the profile and links it to the CRM mirror. Idempotent: platform.event_inbox gates re-delivery,
 *  and the insert is ON CONFLICT DO NOTHING on the primary key. */
export async function onMemberRegistered(deps: {
  tx: any;                                                        // Drizzle transaction from the poller
  crm: { findByEmail(emailNormalized: string): Promise<{ crmClientId: string; fullName?: string; homeAirport?: string } | null> };
  flags: { get(key: string): Promise<boolean> };
  publish: (evt: { type: string; version: number; aggregateType: string; aggregateId: string; memberId: string; payload: unknown }) => Promise<void>;
}, raw: unknown) {
  const evt = MemberRegisteredV1.parse(raw);
  const match = await deps.crm.findByEmail(evt.emailNormalized);
  const openSignups = await deps.flags.get("members.allow_non_crm_signups");
  const status = match ? "active" : openSignups ? "active" : "waitlist";

  await deps.tx.insert(profile).values({
    memberId: evt.memberId,
    crmClientId: match?.crmClientId ?? null,
    linkedAt: match ? new Date() : null,
    displayName: match?.fullName ?? null,
    homeAirport: match?.homeAirport ?? null,
    status,
  }).onConflictDoNothing({ target: profile.memberId });

  if (match) {
    await deps.publish({
      type: "member.linked_to_crm", version: 1, aggregateType: "member", aggregateId: evt.memberId, memberId: evt.memberId,
      payload: { memberId: evt.memberId, crmClientId: match.crmClientId, linkedAt: new Date().toISOString() },
    });
  }
}

/** Nightly reconciliation: the identity hook is post-commit; if a profile is missing, re-emit. */
export async function reconcileMissingProfiles(deps: { db: any; publish: (e: any) => Promise<void> }) {
  const rows: { id: string; email: string; createdAt: Date }[] = await deps.db.execute(
    `SELECT u.id, u.email, u."createdAt" FROM auth."user" u
     LEFT JOIN members.profile p ON p.member_id = u.id
     WHERE p.member_id IS NULL AND u."createdAt" < now() - interval '5 minutes'`
  );
  for (const u of rows) {
    await deps.publish({
      type: "member.registered", version: 1, aggregateType: "member", aggregateId: u.id, memberId: u.id,
      payload: { type: "member.registered", version: 1, memberId: u.id, emailNormalized: u.email.trim().toLowerCase(), registeredAt: u.createdAt.toISOString() },
    });
  }
  return rows.length;
}
