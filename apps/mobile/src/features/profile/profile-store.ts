import type { Profile } from "@/lib/api";

/**
 * The member's profile, one for every screen (F104): Explore, its home airport, a destination's page, a fare and
 * `Request received` used to ask GET /v1/profile three or four times each. Plain module state, read through
 * `useSyncExternalStore` (useProfile.ts), so it is tested without React Native — as the Requests dot is.
 *
 * One question at a time: readers that ask while one is on its way share it. A profile already loaded is read without
 * asking (`loadProfile`); Explore asks again when it comes into view (`refreshProfile`). A failed answer keeps the last
 * profile. A change of member (`resetProfile`) drops it and every answer to a question asked before — a member never
 * sees the profile of the member signed in before.
 */

type Answer = { ok: true; data: Profile } | { ok: false };

let current: Profile | null = null;
/** Moves on with every change of member: an answer to an older question is dropped. */
let generation = 0;
let inFlight: { generation: number; run: Promise<Profile | null> } | null = null;
const listeners = new Set<() => void>();

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
  const run: Promise<Profile | null> = (async () => {
    const result = await fetchProfile();
    if (asked !== generation) return current;
    if (result.ok) publish(result.data);
    return current;
  })().finally(() => {
    if (inFlight?.run === run) inFlight = null;
  });
  inFlight = { generation: asked, run };
  return run;
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
