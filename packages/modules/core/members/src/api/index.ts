/** The only import surface of @bbc/members. Other modules and the host see nothing else. */
import { eq, sql } from "drizzle-orm";
import { profile, notificationPreferences } from "@bbc/db/schema/members";

export type ProfileView = {
  memberId: string;
  status: "active" | "waitlist" | "deleted";
  displayName: string | null;
  homeAirport: string | null;
  timezone: string;
  phone: string | null;
  preferences: {
    destinations?: string[];
    cabin?: "business" | "first";
    frequency?: "monthly" | "quarterly" | "rarely";
    notes?: string;
  };
  crmLinked: boolean;
};

export type NotificationPrefView = {
  offers_personal: boolean;
  offers_broadcast: boolean;
};

export type MembersFacade = ReturnType<typeof createMembersFacade>;

export function createMembersFacade(db: any) {
  /** Scoped by the actor: the query is the ownership check. */
  async function getProfile(exec: any, actorMemberId: string): Promise<ProfileView | null> {
    const [row] = await (exec ?? db).select().from(profile).where(eq(profile.memberId, actorMemberId)).limit(1);
    if (!row) return null;
    return {
      memberId: row.memberId,
      status: row.status,
      displayName: row.displayName,
      homeAirport: row.homeAirport,
      timezone: row.timezone,
      phone: row.phone,
      preferences: (row.preferences as any) ?? {},
      crmLinked: row.crmClientId != null,
    };
  }
  /** "pending": registered, member.registered not delivered yet → the app keeps the splash, never a wrong screen. */
  async function getStatus(exec: any, memberId: string): Promise<ProfileView["status"] | "pending"> {
    const p = await getProfile(exec, memberId);
    return p?.status ?? "pending";
  }
  async function timezoneOf(exec: any, memberId: string): Promise<string> {
    return (await getProfile(exec, memberId))?.timezone ?? "America/New_York";
  }

  /** Active members only — waitlist/deleted are never push/broadcast targets. */
  async function activeMemberIds(exec?: any): Promise<string[]> {
    const rows = await (exec ?? db)
      .select({ memberId: profile.memberId })
      .from(profile)
      .where(eq(profile.status, "active"));
    return rows.map((r: { memberId: string }) => r.memberId);
  }

  /** Missing preference rows default to enabled (opt-out). Transactional is always on and not returned. */
  async function preferencesOf(exec: any, memberId: string): Promise<NotificationPrefView> {
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

  /** PATCH /v1/profile — partial update, actor-scoped. Returns updated view. */
  async function updateProfile(
    exec: any,
    actorMemberId: string,
    data: {
      displayName?: string;
      homeAirport?: string;
      timezone?: string;
      phone?: string;
      preferences?: Record<string, unknown>;
    },
  ): Promise<ProfileView | null> {
    const set: Record<string, unknown> = { updatedAt: sql`now()` };
    if (data.displayName !== undefined) set.displayName = data.displayName;
    if (data.homeAirport !== undefined) set.homeAirport = data.homeAirport.toUpperCase();
    if (data.timezone !== undefined) set.timezone = data.timezone;
    if (data.phone !== undefined) set.phone = data.phone;
    if (data.preferences !== undefined) set.preferences = data.preferences;
    await (exec ?? db).update(profile).set(set).where(eq(profile.memberId, actorMemberId));
    return getProfile(exec, actorMemberId);
  }

  /** PUT /v1/profile/preferences — replaces notification preferences for the actor.
   *  Transactional category is always enabled (DB CHECK constraint enforces it). */
  async function setNotificationPreferences(
    exec: any,
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
    setNotificationPreferences,
  };
}
