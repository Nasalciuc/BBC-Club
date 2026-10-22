import { appStorage, ONBOARDED_KEY } from "../../lib/storage-keys";
import { clearRecentSearches } from "../explore/recent-searches";
import { clearSaved } from "../saved/saved";

/**
 * Whose member data the phone holds: the saved fares and destinations, the recent searches with their travel dates,
 * the onboarded flag. They live in one device-wide store (lib/storage-keys.ts), so without an owner a session that
 * lapsed (no sign-out ran) would hand them to the next member who signs in — as lib/queue.ts adoptQueue already
 * prevents for requests.
 */
export const LOCAL_OWNER_KEY = "bbcclub.localOwner";

/** What the phone keeps for one member, removed: on an explicit Sign out or Delete account, and on a change of member. */
export function clearMemberData(): void {
  clearSaved();
  clearRecentSearches();
  appStorage.remove(ONBOARDED_KEY);
}

/**
 * The member data on the phone is `memberId`'s. Called after each sign-in (before the post-auth route is chosen: the
 * onboarded flag decides it) and whenever a member is signed in. No owner yet (an install from before this marker): the
 * data is theirs. Another owner: their data goes first, then the marker — an app stopped between the two clears it again
 * on the next call, never leaving one member's data under another's name.
 */
export function adoptLocalData(memberId: string): void {
  const owner = appStorage.getString(LOCAL_OWNER_KEY);
  if (owner === memberId) return;
  if (owner) clearMemberData();
  appStorage.set(LOCAL_OWNER_KEY, memberId);
}

/** An explicit Sign out or Delete account: the next member to sign in adopts a phone with nothing of anyone's. */
export function forgetLocalOwner(): void {
  appStorage.remove(LOCAL_OWNER_KEY);
}
