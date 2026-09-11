import type { Role } from "@bbc/shared/authz/permissions";

/** Exactly one per request or per handler invocation. */
export type Principal =
  | { kind: "member"; memberId: string; role: "member"; sessionId: string }
  | { kind: "operator"; operatorId: string; role: "operator"; email: string }
  | { kind: "system"; role: "system"; source: "internal-secret" | "jwt" | "handler" | "cron"; actorMemberId?: string }
  | { kind: "anonymous"; role?: undefined };

export const isMember = (p: Principal): p is Extract<Principal, { kind: "member" }> => p.kind === "member";

/** The member a scoped repository must use. Members act for themselves; system handlers act for the
 *  event's actor. Never taken from client input. */
export function actorMemberId(p: Principal): string | null {
  if (p.kind === "member") return p.memberId;
  if (p.kind === "system" && p.actorMemberId) return p.actorMemberId;
  return null;
}
export function roleOf(p: Principal): Role | null { return p.kind === "anonymous" ? null : p.role; }
