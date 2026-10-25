import type { Profile } from "@/lib/api";

import { mergeSavedProfile, type SavedProfile } from "./notifications-logic";

/**
 * The member's profile, one for every screen (F104): Explore, its home airport, a destination's page, a fare and
 * `Request received` used to ask GET /v1/profile three or four times each. Plain module state, read through
 * `useSyncExternalStore` (useProfile.ts), so it is tested without React Native — as the Requests dot is.
 *
 * One question at a time: readers that ask while one is on its way share it. A profile already loaded is read without
 * asking (`loadProfile`); Explore asks again when it comes into view (`refreshProfile`). A failed answer keeps the last
 * profile. A change of member (`resetProfile`) drops it and every answer to a question asked before — a member never
 * sees the profile of the member signed in before. A profile sheet's save — on Edit profile, Profile or Settings, each
 * through its own copy (profile-save-logic.ts) — is every screen's at once (`storeSavedProfile`).
 */

type Answer = { ok: true; data: Profile } | { ok: false };

let current: Profile | null = null;
/** Moves on with every change of member and every save over the profile held: an older question's answer is dropped. */
let generation = 0;
/**
 * The question on its way, and the latest save made while it was and the store held no profile (`storeSavedProfile`):
 * laid over its answer, it goes with the question.
 */
let inFlight: { generation: number; run: Promise<Profile | null>; saved: SavedProfile | null } | null = null;
const listeners = new Set<() => void>();
const saveListeners = new Set<(next: SavedProfile) => void>();

function publish(profile: Profile | null): void {
  current = profile;
  for (const listener of listeners) listener();
}

export function profileSnapshot(): Profile | null {
  return current;
}

export function subscribeProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the server (`fetchProfile` in the app); a question already on its way is joined. */
export function refreshProfile(fetchProfile: () => Promise<Answer>): Promise<Profile | null> {
  if (inFlight && inFlight.generation === generation) return inFlight.run;
  const asked = generation;
  // This question's slot: `storeSavedProfile` fills it through `inFlight`, the answer reads it here.
  const slot: { saved: SavedProfile | null } = { saved: null };
  const run: Promise<Profile | null> = (async () => {
    const result = await fetchProfile();
    if (asked !== generation) return current;
    if (result.ok) publish(withSaveMeanwhile(result.data, slot.saved));
    return current;
  })().finally(() => {
    if (inFlight?.run === run) inFlight = null;
  });
  inFlight = Object.assign(slot, { generation: asked, run });
  return run;
}

/** An answer to a question asked before a save: the save laid over it if it is the same member's. */
function withSaveMeanwhile(answer: Profile, saved: SavedProfile | null): Profile {
  return saved !== null && saved.memberId === answer.memberId ? mergeSavedProfile(answer, saved) : answer;
}

/** The profile already loaded, else one question (joined if one is on its way). */
export function loadProfile(fetchProfile: () => Promise<Answer>): Promise<Profile | null> {
  return current ? Promise.resolve(current) : refreshProfile(fetchProfile);
}

/** Sign-out, a deleted account, a new sign-in: the profile is the next member's to load. */
export function resetProfile(): void {
  generation += 1;
  inFlight = null;
  if (current !== null) publish(null);
}

/**
 * A sheet saved the profile and PATCH /v1/profile answered: that answer is the member's profile now, on every screen
 * at once — Explore's greeting, Profile's name, the request sheet's contact (brief 3.4.1). A question asked before the
 * save may bring the profile back as it was: its answer is dropped, and the next reader asks again. An answer without
 * `notifications` (an older server) keeps the ones known.
 *
 * The screens that keep their own copy (`subscribeProfileSaves`) hear every save, whether or not a profile was loaded
 * here: Explore's question may have failed (offline, the club not answering) while Profile holds its own, and Profile
 * must not say `Member` once a name is saved. Each copy takes only its own member's (profile-save-logic.ts).
 *
 * With no profile loaded the store holds no half profile (PATCH's answer has no `notifications`) and drops no
 * question: a reader waiting on one (Explore's airport) still gets a profile. But that question was asked before the
 * save, and its answer may hold the old name or airport: the save waits with it and is laid over its answer if that is
 * the same member's, the answer's `notifications` kept. A later save replaces an earlier one (PATCH answers with the
 * whole row); the save goes with its question — answered, failed, or dropped by a change of member (`resetProfile`) —
 * so it is never laid over an answer to a question asked after it. With no question on its way, Explore's next one,
 * each time it comes into view, brings the save. A save that answers after a change of member (the store holds another
 * member) is nobody's: no screen hears it.
 */
export function storeSavedProfile(next: SavedProfile): void {
  if (current !== null) {
    if (current.memberId !== next.memberId) return;
    generation += 1;
    inFlight = null;
    publish(mergeSavedProfile(current, next));
  } else if (inFlight !== null && inFlight.generation === generation) {
    inFlight.saved = next;
  }
  for (const listener of saveListeners) listener(next);
}

/**
 * A screen that keeps its own copy of the profile (Profile) hears each save made elsewhere (Edit profile, Settings):
 * PATCH's answer as it came, which it merges into its own copy if it is the same member's — an answer without
 * `notifications` keeps its own.
 */
export function subscribeProfileSaves(listener: (next: SavedProfile) => void): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}
