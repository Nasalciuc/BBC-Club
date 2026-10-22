import { profile } from "@bbc/db/schema/members";
import type { Executor } from "@bbc/db";
import type { ProfileCreationDeps } from "../api";

/** The one way a profile row is made — by the member.registered delivery, and by a profile write that comes before it
 *  (`ensureProfile`, right after the join code). Matched by normalized email against the CRM mirror: `active` and linked
 *  if matched; otherwise `waitlist` (ADR-PROD-001: `members.allow_non_crm_signups` stays off in v1). INSERT … ON CONFLICT
 *  DO NOTHING on the primary key: whichever comes first makes the row, the other is a no-op. Publishes nothing — the
 *  delivery publishes member.linked_to_crm from the row it finds. */
export async function insertProfile(
  tx: Executor,
  deps: ProfileCreationDeps,
  memberId: string,
  emailNormalized: string,
): Promise<void> {
  const match = await deps.crm.findByEmail(emailNormalized);
  const openSignups = await deps.flags.get("members.allow_non_crm_signups");
  const status = match ? "active" : openSignups ? "active" : "waitlist";
  await tx
    .insert(profile)
    .values({
      memberId,
      crmClientId: match?.crmClientId ?? null,
      linkedAt: match ? new Date() : null,
      displayName: match?.fullName ?? null,
      homeAirport: match?.homeAirport ?? null,
      status,
    })
    .onConflictDoNothing({ target: profile.memberId });
}
