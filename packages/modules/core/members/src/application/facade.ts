/** The only import surface of @bbc/members. Other modules and the host see nothing else. */
import { and, eq, gt, ne, notExists, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { profile, notificationPreferences, type TravelPreferences } from "@bbc/db/schema/members";
import type { TravelPreferencesBody } from "@bbc/shared/api/v1/proposals";
import type { AudienceMember, MembersFacade, ProfileRow, NotificationPrefView, ProfileCreationDeps } from "../api";
import { insertProfile } from "./create-profile";

export type { ProfileRow, NotificationPrefView, MembersFacade };
export { toProfileVM } from "./to-profile-vm";

/** Implementation — imported by module.ts and contract tests, not by other packages. */
export function createMembersFacade(db: Executor): MembersFacade {
  /** A `deleted` profile is invisible to every read and write that serves the member; only getStatus sees it (so
   *  dispatch can suppress with member_deleted). Nothing sets the status today — deletion is a hard delete through
   *  member.deleted — so this is the guard for the day something does. */
  const live = (memberId: string) => and(eq(profile.memberId, memberId), ne(profile.status, "deleted"));

  async function readProfile(exec: Executor | undefined, memberId: string, deleted: "hide" | "show") {
    const [row] = await (exec ?? db)
      .select()
      .from(profile)
      .where(deleted === "hide" ? live(memberId) : eq(profile.memberId, memberId))
      .limit(1);
    return row;
  }

  async function getProfile(exec: Executor | undefined, actorMemberId: string): Promise<ProfileRow | null> {
    const row = await readProfile(exec, actorMemberId, "hide");
    if (!row) return null;
    return {
      memberId: row.memberId,
      status: row.status,
      displayName: row.displayName,
      homeAirport: row.homeAirport,
      avatarUrl: row.avatarUrl,
      timezone: row.timezone,
      phone: row.phone,
      preferences: (row.preferences as ProfileRow["preferences"]) ?? {},
      memberSince: row.memberSince,
      crmLinkedAt: row.linkedAt,
      crmLinked: row.crmClientId != null,
    };
  }
  async function getStatus(exec: Executor | undefined, memberId: string): Promise<ProfileRow["status"] | "pending"> {
    return (await readProfile(exec, memberId, "show"))?.status ?? "pending";
  }
  async function timezoneOf(exec: Executor | undefined, memberId: string): Promise<string> {
    return (await getProfile(exec, memberId))?.timezone ?? "America/New_York";
  }

  async function activeMemberIds(exec: Executor | undefined): Promise<string[]> {
    const rows = await (exec ?? db)
      .select({ memberId: profile.memberId })
      .from(profile)
      .where(eq(profile.status, "active"));
    return rows.map((r: { memberId: string }) => r.memberId);
  }

  async function audiencePage(
    exec: Executor | undefined,
    q: { category: "offers_broadcast" | "offers_personal"; after: string | null; limit: number },
  ): Promise<AudienceMember[]> {
    const conn = exec ?? db;
    // The preferences table stores opt-outs: a missing row means enabled.
    const optedOut = conn
      .select({ one: sql`1` })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.memberId, profile.memberId),
          eq(notificationPreferences.category, q.category),
          eq(notificationPreferences.enabled, false),
        ),
      );
    return conn
      .select({ memberId: profile.memberId, timezone: profile.timezone })
      .from(profile)
      .where(
        and(
          eq(profile.status, "active"),
          q.after === null ? undefined : gt(profile.memberId, q.after),
          notExists(optedOut),
        ),
      )
      .orderBy(profile.memberId)
      .limit(q.limit);
  }

  async function preferencesOf(exec: Executor | undefined, memberId: string): Promise<NotificationPrefView> {
    const rows = await (exec ?? db)
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.memberId, memberId));
    const map = Object.fromEntries(rows.map((r: { category: string; enabled: boolean }) => [r.category, r.enabled]));
    return {
      offers_personal: map.offers_personal !== false,
      offers_broadcast: map.offers_broadcast !== false,
    };
  }

  async function updateProfile(
    exec: Executor | undefined,
    actorMemberId: string,
    data: {
      displayName?: string;
      homeAirport?: string;
      timezone?: string;
      phone?: string;
      preferences?: Record<string, unknown>;
    },
  ): Promise<ProfileRow | null> {
    const set: Record<string, unknown> = { updatedAt: sql`now()` };
    if (data.displayName !== undefined) set.displayName = data.displayName;
    if (data.homeAirport !== undefined) set.homeAirport = data.homeAirport.toUpperCase();
    if (data.timezone !== undefined) set.timezone = data.timezone;
    if (data.phone !== undefined) set.phone = data.phone;
    if (data.preferences !== undefined) set.preferences = data.preferences;
    await (exec ?? db).update(profile).set(set).where(live(actorMemberId));
    return getProfile(exec, actorMemberId);
  }

  /** Merges, never replaces. A client that sends only { cabin } must not wipe passengers. The merge is one statement
   *  (jsonb `||` on the row it locks): read, merge in JS, then write let the last of two saves at once drop the other's
   *  field under READ COMMITTED. Top-level keys sent replace, keys not sent stay. */
  async function setTravelPreferences(
    exec: Executor | undefined,
    actorMemberId: string,
    patch: TravelPreferencesBody,
  ): Promise<ProfileRow | null> {
    const sent: TravelPreferences = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const rows = await (exec ?? db)
      .update(profile)
      .set({
        preferences: sql`coalesce(${profile.preferences}, '{}'::jsonb) || ${JSON.stringify(sent)}::jsonb`,
        updatedAt: sql`now()`,
      })
      .where(live(actorMemberId))
      .returning({ memberId: profile.memberId });
    if (rows.length === 0) return null;
    return getProfile(exec, actorMemberId);
  }

  /** Makes the member's profile row now if member.registered has not been delivered yet — right after the join code,
   *  onboarding's first save found no row and answered 404. The delivery's own insert (shared: `insertProfile`) then
   *  does nothing, and it publishes member.linked_to_crm once; this publishes nothing. A row already there is left. */
  async function ensureProfile(
    exec: Executor | undefined,
    memberId: string,
    emailNormalized: string,
    deps: ProfileCreationDeps,
  ): Promise<void> {
    await insertProfile(exec ?? db, deps, memberId, emailNormalized);
  }

  async function setNotificationPreferences(
    exec: Executor | undefined,
    actorMemberId: string,
    prefs: Array<{ category: "offers_personal" | "offers_broadcast"; enabled: boolean }>,
  ): Promise<void> {
    for (const p of prefs) {
      await (exec ?? db)
        .insert(notificationPreferences)
        .values({ memberId: actorMemberId, category: p.category, enabled: p.enabled })
        .onConflictDoUpdate({
          target: [notificationPreferences.memberId, notificationPreferences.category],
          set: { enabled: p.enabled, updatedAt: sql`now()` },
        });
    }
  }

  return {
    getProfile,
    getStatus,
    timezoneOf,
    activeMemberIds,
    audiencePage,
    preferencesOf,
    updateProfile,
    setTravelPreferences,
    setNotificationPreferences,
    ensureProfile,
  };
}
