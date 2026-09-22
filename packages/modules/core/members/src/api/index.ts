import type { Executor } from "@bbc/db";

export type ProfileRow = {
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
  memberSince: Date;
  crmLinkedAt: Date | null;
  crmLinked: boolean;
};

/** @deprecated Use ProfileRow — kept as alias for gradual call-site updates inside the module. */
export type ProfileView = ProfileRow;

export type MemberStatus = ProfileRow["status"] | "pending";

export type NotificationPrefView = {
  offers_personal: boolean;
  offers_broadcast: boolean;
};

/** The only import surface of @bbc/members. module.ts implements it; consumers import it. */
export type MembersFacade = {
  getProfile(exec: Executor | undefined, actorMemberId: string): Promise<ProfileRow | null>;
  getStatus(exec: Executor | undefined, memberId: string): Promise<MemberStatus>;
  timezoneOf(exec: Executor | undefined, memberId: string): Promise<string>;
  activeMemberIds(exec: Executor | undefined): Promise<string[]>;
  preferencesOf(exec: Executor | undefined, memberId: string): Promise<NotificationPrefView>;
  updateProfile(
    exec: Executor | undefined,
    actorMemberId: string,
    data: {
      displayName?: string;
      homeAirport?: string;
      timezone?: string;
      phone?: string;
      preferences?: Record<string, unknown>;
    },
  ): Promise<ProfileRow | null>;
  setNotificationPreferences(
    exec: Executor | undefined,
    actorMemberId: string,
    prefs: Array<{ category: "offers_personal" | "offers_broadcast"; enabled: boolean }>,
  ): Promise<void>;
};
