import type { RequestVM } from "@bbc/shared/api/v1/requests";

import { isOpen } from "../requests/status";

/** What Profile, Edit profile and Settings say about the member (12, 34, 36) — pure, so it is tested without React
 *  Native. */

type Preferences = { cabin?: "business" | "first"; passengers?: { adult: number } } | null | undefined;

/** `Business` or `First`: the cabin a search and a request start from. */
export function cabinLabel(prefs: Preferences): string {
  return prefs?.cabin === "first" ? "First" : "Business";
}

/** `1 adult`, `2 adults`: the usual party — children and infants are added to a request, not to the profile. */
export function travelersLabel(prefs: Preferences): string {
  const n = prefs?.passengers?.adult ?? 1;
  return n === 1 ? "1 adult" : `${n} adults`;
}

/**
 * Profile's numbers from the requests the club holds (12) — those still on the phone are not the club's yet, and
 * deleting the account does not close them: `Trips`, every request that has not been closed (12: London, Tokyo and
 * Dubai — Paris, closed, is no trip); `Open requests`, those still in progress. The server lists its first fifty, those
 * in progress first (ADR-IMPL-042): past them `Trips` says `50+`, and `Open requests` only when all fifty are open.
 * `Saved` is the phone's own count (features/saved).
 */
export function profileStats(
  items: readonly { status: RequestVM["status"] }[],
  hasMore: boolean,
): { trips: string; open: string } {
  const trips = items.filter((r) => r.status !== "closed").length;
  const open = openRequestsFor(items, hasMore);
  return { trips: hasMore ? `${trips}+` : String(trips), open: open.more ? `${open.count}+` : String(open.count) };
}

/**
 * The open requests among the server's first fifty, and whether more lie past them: the server lists those in
 * progress first (ADR-IMPL-042), so only a page that is all open, with more after it, leaves some uncounted.
 */
export function openRequestsFor(
  items: readonly { status: RequestVM["status"] }[],
  hasMore: boolean,
): { count: number; more: boolean } {
  const count = items.filter((r) => isOpen(r.status)).length;
  return { count, more: hasMore && count === items.length };
}

/**
 * 35: what deleting the account closes, on a line of its own (F106) — the exact count, `more than` it when the first
 * page did not hold them all, nothing when none is open, and no number when the requests did not load (null).
 */
export function openRequestsLine(open: { count: number; more?: boolean } | null): string | null {
  if (open === null) return "Any open requests are closed.";
  if (open.count <= 0) return null;
  if (open.more) return `This closes more than ${open.count} open requests.`;
  return `This closes ${open.count} open request${open.count === 1 ? "" : "s"}.`;
}
