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
  const open = items.filter((r) => isOpen(r.status)).length;
  const trips = items.filter((r) => r.status !== "closed").length;
  const moreOpen = hasMore && open === items.length;
  return { trips: hasMore ? `${trips}+` : String(trips), open: moreOpen ? `${open}+` : String(open) };
}
