import type { ProfileVM } from "@bbc/shared/api/v1/profile";

/** Row shape needed to build ProfileVM — avoids importing ProfileRow from api/ (cycle). */
type ProfileSource = {
  memberId: string;
  status: "active" | "waitlist" | "deleted";
  displayName: string | null;
  homeAirport: string | null;
  timezone: string;
  phone: string | null;
  preferences: ProfileVM["preferences"];
  memberSince: Date;
  crmLinkedAt: Date | null;
  crmLinked: boolean;
};

/** Always returns a parseable ProfileVM. Null row → complete pending stub with defaults. */
export function toProfileVM(row: ProfileSource | null, email: string | null, memberId: string): ProfileVM {
  if (!row) {
    return {
      memberId,
      status: "pending",
      email,
      displayName: null,
      homeAirport: null,
      timezone: "America/New_York",
      phone: null,
      memberSince: null,
      crmLinkedAt: null,
      crmLinked: false,
      preferences: {},
    };
  }
  return {
    memberId: row.memberId,
    status: row.status,
    email,
    displayName: row.displayName,
    homeAirport: row.homeAirport,
    timezone: row.timezone,
    phone: row.phone,
    memberSince: row.memberSince.toISOString(),
    crmLinkedAt: row.crmLinkedAt ? row.crmLinkedAt.toISOString() : null,
    crmLinked: row.crmLinked,
    preferences: row.preferences ?? {},
  };
}
