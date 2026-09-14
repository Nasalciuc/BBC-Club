/** The only import surface of @bbc/members. Other modules and the host see nothing else. */
import { eq } from "drizzle-orm";
import { profile } from "@bbc/db/schema/members";

export type ProfileView = {
  memberId: string;
  status: "active" | "waitlist" | "deleted";
  displayName: string | null;
  homeAirport: string | null;
  timezone: string;
  crmLinked: boolean;
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
  return { getProfile, getStatus, timezoneOf };
}
