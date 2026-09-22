/** The only import surface of @bbc/members. Other modules and the host see nothing else. */
import { eq, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { profile, notificationPreferences, type TravelPreferences } from "@bbc/db/schema/members";
import type { TravelPreferencesBody } from "@bbc/shared/api/v1/proposals";
import type { MembersFacade, ProfileRow, NotificationPrefView } from "../api";

export type { ProfileRow, NotificationPrefView, MembersFacade };
export { toProfileVM } from "./to-profile-vm";

/** Implementation — imported by module.ts and contract tests, not by other packages. */
export function createMembersFacade(db: Executor): MembersFacade {
  async function getProfile(exec: Executor | undefined, actorMemberId: string): Promise<ProfileRow | null> {
    const [row] = await (exec ?? db).select().from(profile).where(eq(profile.memberId, actorMemberId)).limit(1);
    if (!row) return null;
    return {
      memberId: row.memberId,
      status: row.status,
      displayName: row.displayName,
      homeAirport: row.homeAirport,
      timezone: row.timezone,
      phone: row.phone,
      preferences: (row.preferences as ProfileRow["preferences"]) ?? {},
      memberSince: row.memberSince,
      crmLinkedAt: row.linkedAt,
      crmLinked: row.crmClientId != null,
    };
  }
  async function getStatus(exec: Executor | undefined, memberId: string): Promise<ProfileRow["status"] | "pending"> {
    const p = await getProfile(exec, memberId);
    return p?.status ?? "pending";
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
    await (exec ?? db).update(profile).set(set).where(eq(profile.memberId, actorMemberId));
    return getProfile(exec, actorMemberId);
  }

  /** Merges, never replaces. A client that sends only { cabin } must not wipe passengers. */
  async function setTravelPreferences(
    exec: Executor | undefined,
    actorMemberId: string,
    patch: TravelPreferencesBody,
  ): Promise<ProfileRow | null> {
    const [row] = await (exec ?? db)
      .select({ preferences: profile.preferences })
      .from(profile)
      .where(eq(profile.memberId, actorMemberId))
      .limit(1);
    if (!row) return null;
    const merged: TravelPreferences = { ...(row.preferences ?? {}), ...patch };
    await (exec ?? db)
      .update(profile)
      .set({ preferences: merged, updatedAt: sql`now()` })
      .where(eq(profile.memberId, actorMemberId));
    return getProfile(exec, actorMemberId);
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
    preferencesOf,
    updateProfile,
    setTravelPreferences,
    setNotificationPreferences,
  };
}
