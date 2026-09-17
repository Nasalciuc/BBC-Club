import type { Href } from "expo-router";

import { fetchProfile, type Profile } from "@/lib/api";

const PENDING_ATTEMPTS = 2;
const PENDING_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Poll briefly while members.profile is still catching up after member.registered. */
export async function loadProfileAfterAuth(): Promise<Profile | null> {
  for (let i = 0; i < PENDING_ATTEMPTS; i++) {
    const result = await fetchProfile();
    if (!result.ok) {
      if (result.status === 401) return null;
      await sleep(PENDING_DELAY_MS);
      continue;
    }
    if (result.data.status !== "pending") return result.data;
    await sleep(PENDING_DELAY_MS);
  }
  const last = await fetchProfile();
  return last.ok ? last.data : null;
}

/** Living profiles (active, waitlist, pending) land on Explore. Waitlist is a status, not a screen. */
export function routeForProfile(profile: Profile | null): Href {
  if (!profile || profile.status === "deleted") return "/sign-in";
  return "/(tabs)/explore";
}

export async function resolvePostAuthRoute(): Promise<Href> {
  const profile = await loadProfileAfterAuth();
  return routeForProfile(profile);
}
