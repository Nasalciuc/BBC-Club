import type { Href } from "expo-router";

import { fetchProfile, type Profile } from "@/lib/api";
import { appStorage, ONBOARDED_KEY } from "@/lib/storage-keys";

const PENDING_ATTEMPTS = 2;
const PENDING_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isOnboarded(): boolean {
  return appStorage.getBoolean(ONBOARDED_KEY) === true;
}

/** Poll briefly while members.profile is still catching up after member.registered.
 *  Also retries a short 401 window — Expo may not have written the session cookie yet. */
export async function loadProfileAfterAuth(): Promise<Profile | null> {
  for (let i = 0; i < PENDING_ATTEMPTS; i++) {
    const result = await fetchProfile();
    if (!result.ok) {
      await sleep(PENDING_DELAY_MS);
      continue;
    }
    if (result.data.status !== "pending") return result.data;
    await sleep(PENDING_DELAY_MS);
  }
  const last = await fetchProfile();
  return last.ok ? last.data : null;
}

/**
 * Living profiles land on Explore — unless home airport is unset and this device
 * has not finished (or skipped) onboarding yet.
 */
export function routeForProfile(profile: Profile | null): Href {
  if (!profile || profile.status === "deleted") return "/sign-in";
  if (profile.homeAirport == null && !isOnboarded()) return "/onboarding";
  return "/(tabs)/explore" as Href;
}

export async function resolvePostAuthRoute(): Promise<Href> {
  const profile = await loadProfileAfterAuth();
  return routeForProfile(profile);
}
