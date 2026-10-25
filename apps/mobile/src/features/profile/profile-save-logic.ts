import type { Profile } from "@/lib/api";

import { mergeSavedProfile, type SavedProfile } from "./notifications-logic";
import { storeSavedProfile, subscribeProfileSaves } from "./profile-store";

type Update = (prev: Profile | null) => Profile | null;

/** What a screen does with each change of its copy: React's `setProfile`, a plain variable in the tests. */
export type SetCopy = (update: Update) => void;

export type ProfileCopy = {
  /**
   * A profile sheet on this screen saved, and PATCH /v1/profile answered: this screen's copy takes the answer, and so
   * does every other screen at once (`storeSavedProfile`) — Explore's greeting, Profile's name and the request sheet's
   * contact never wait for their next load (brief 3.4.1).
   */
  saved: (next: SavedProfile) => void;
  /** A change this screen keeps to itself (the offers switch, which no other screen reads). */
  change: (update: Update) => void;
  /**
   * Profile: every save made on another screen (Edit profile's name, Settings' phone) is taken as its own — the same
   * member's, whether or not the shared store holds a profile (Explore's load may have failed).
   */
  follow: () => () => void;
  /**
   * At a load's start: whether, when its answer comes, nothing was saved or changed here since. A load begun before a
   * save brings the profile back as it was (the old name, `Member`), and is not shown.
   */
  loadBegun: () => () => boolean;
};

/**
 * A screen's own copy of the member's profile (Edit profile, Profile, Settings): the one way their sheets' saves reach
 * it and the shared store (profile-store.ts) — pure, so the wiring is tested without React Native. The screen makes it
 * once (`useState(() => profileCopy(setProfile))`) and hands `saved` to its sheets.
 *
 * Profile hears its own saves back from the store (`follow`): merging the same answer again changes nothing.
 */
export function profileCopy(setCopy: SetCopy): ProfileCopy {
  let changes = 0;
  function change(update: Update): void {
    changes += 1;
    setCopy(update);
  }
  // A save is taken by the copy of the same member only: the store tells every copy, loaded there or not.
  function take(next: SavedProfile): void {
    change((prev) => (prev && prev.memberId === next.memberId ? mergeSavedProfile(prev, next) : prev));
  }
  return {
    saved(next) {
      take(next);
      storeSavedProfile(next);
    },
    change,
    follow: () => subscribeProfileSaves(take),
    loadBegun() {
      const at = changes;
      return () => changes === at;
    },
  };
}
