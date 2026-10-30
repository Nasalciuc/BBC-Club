import { MemberRegisteredV1 } from "@bbc/shared/events/member";
import { event } from "@bbc/shared/events";
import { profile } from "@bbc/db/schema/members";
import { eq } from "drizzle-orm";
import { anyOf } from "@bbc/db/helpers";
import type { Executor } from "@bbc/db";
import { insertProfile } from "../application/create-profile";
import type { ProfileCreationDeps } from "../api";

/** Creates the profile and links it to the CRM mirror. Idempotent: platform.event_inbox gates re-delivery,
 *  and the insert is ON CONFLICT DO NOTHING on the primary key. A profile write right after the join code may have
 *  made the row first (`ensureProfile`, same insert): this delivery's insert is then a no-op, and it still publishes
 *  member.linked_to_crm — once, from the row, so it never claims a link the row does not have. */
export async function onMemberRegistered(
  deps: ProfileCreationDeps & {
    tx: Executor; // the poller's delivery transaction
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
  await insertProfile(deps.tx, deps, evt.memberId, evt.emailNormalized);

  const [row] = await deps.tx
    .select({ crmClientId: profile.crmClientId, linkedAt: profile.linkedAt })
    .from(profile)
    .where(eq(profile.memberId, evt.memberId))
    .limit(1);
  if (row?.crmClientId) {
    await deps.publish({
      type: "member.linked_to_crm",
      version: 1,
      aggregateType: "member",
      aggregateId: evt.memberId,
      memberId: evt.memberId,
      payload: event("member.linked_to_crm", {
        memberId: evt.memberId,
        crmClientId: row.crmClientId,
        linkedAt: (row.linkedAt ?? new Date()).toISOString(),
      }),
    });
  }
}

export type IdentityUsersPort = {
  listUsersCreatedBefore(before: Date): Promise<{ id: string; email: string; createdAt: Date }[]>;
};

/** Every 15 minutes (reconcile-profiles): the identity hook publishes after Better Auth's insert, outside its
 *  transaction. If the event was lost, the member has an auth user and no profile. Diff in memory — no cross-schema
 *  SQL. */
export async function reconcileMissingProfiles(deps: {
  db: Executor;
  identity: IdentityUsersPort;
  publish: (e: any) => Promise<void>;
}) {
  const users = await deps.identity.listUsersCreatedBefore(new Date(Date.now() - 5 * 60_000));
  if (users.length === 0) return 0;
  const rows: { id: string }[] = await deps.db
    .select({ id: profile.memberId })
    .from(profile)
    .where(
      anyOf(
        profile.memberId,
        users.map((u) => u.id),
        "text",
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
