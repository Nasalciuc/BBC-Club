import type { Executor } from "@bbc/db";
import type { TravelPreferencesBody } from "@bbc/shared/api/v1/proposals";

/** What making a profile row needs: the CRM mirror lookup and the open-signups flag (ADR-PROD-001). */
export type ProfileCreationDeps = {
  crm: {
    findByEmail(
      emailNormalized: string,
    ): Promise<{ crmClientId: string; fullName?: string; homeAirport?: string } | null>;
  };
  flags: { get(key: string): Promise<boolean> };
};

export type ProfileRow = {
  memberId: string;
  status: "active" | "waitlist" | "deleted";
  displayName: string | null;
  homeAirport: string | null;
  /** The member's photo, an https address, or null (ADR-IMPL-056). No route sets it. */
  avatarUrl: string | null;
  /** The tag of the photo the member added themselves (ADR-IMPL-070) — the sha256 of its bytes — or null. The bytes
   *  stay in members.profile_photo, served only to the member (GET /v1/profile/photo). */
  photoEtag: string | null;
  timezone: string;
  phone: string | null;
  preferences: {
    destinations?: string[];
    cabin?: "business" | "first";
    frequency?: "monthly" | "quarterly" | "rarely";
    passengers?: { adult: number; child: number; infant: number };
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

/** One page of a campaign audience: active members who accept `category`, in member-id order. */
export type AudienceMember = { memberId: string; timezone: string };

export { toProfileVM } from "../application/to-profile-vm";

/** The only import surface of @bbc/members. module.ts implements it; consumers import it. */
export type MembersFacade = {
  getProfile(exec: Executor | undefined, actorMemberId: string): Promise<ProfileRow | null>;
  getStatus(exec: Executor | undefined, memberId: string): Promise<MemberStatus>;
  timezoneOf(exec: Executor | undefined, memberId: string): Promise<string>;
  activeMemberIds(exec: Executor | undefined): Promise<string[]>;
  /** Active members who accept `category`, with their time zone — one page, keyset on member id.
   *  A missing preference row means enabled. Campaign fan-out pages through this instead of loading every id. */
  audiencePage(
    exec: Executor | undefined,
    q: { category: "offers_broadcast" | "offers_personal"; after: string | null; limit: number },
  ): Promise<AudienceMember[]>;
  preferencesOf(exec: Executor | undefined, memberId: string): Promise<NotificationPrefView>;
  /** Each member's status and offer preferences, for a batch of notifications (ADR-IMPL-077): two statements whatever
   *  the number of members — what getStatus and preferencesOf answer one by one. A member with no profile is `pending`;
   *  a missing preference row means enabled. */
  deliverabilityOf(
    exec: Executor | undefined,
    memberIds: readonly string[],
  ): Promise<Map<string, { status: MemberStatus; prefs: NotificationPrefView }>>;
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
  /** Merges, never replaces. A client that sends only { cabin } must not wipe passengers. */
  setTravelPreferences(
    exec: Executor | undefined,
    actorMemberId: string,
    patch: TravelPreferencesBody,
  ): Promise<ProfileRow | null>;
  setNotificationPreferences(
    exec: Executor | undefined,
    actorMemberId: string,
    prefs: Array<{ category: "offers_personal" | "offers_broadcast"; enabled: boolean }>,
  ): Promise<void>;
  /** The member's profile row, made now if member.registered has not been delivered yet (the same insert the delivery
   *  makes; ON CONFLICT DO NOTHING). Publishes nothing: the delivery still links to the CRM, once. */
  ensureProfile(
    exec: Executor | undefined,
    memberId: string,
    emailNormalized: string,
    deps: ProfileCreationDeps,
  ): Promise<void>;
};
