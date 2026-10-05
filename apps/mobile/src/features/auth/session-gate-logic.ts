import type { ApiResult, Profile } from "@/lib/api";

/** What we know after trying to read the profile. Only "signed-out" may lead to the sign-in screen. */
export type ProfileLoad =
  | { kind: "ok"; profile: Profile }
  | { kind: "signed-out" } // 401 that outlived the short SecureStore grace window
  | { kind: "unavailable"; status: number }; // 429, 5xx, 0 (timeout / offline): busy or unreachable — NOT a sign-out

/** 250 ms covers the post-registration "pending" profile and the SecureStore cookie race (the old behaviour);
 *  the longer steps give a busy server room. Waits sit between attempts only — worst case ≈ 1.75 s. */
export const BACKOFF_MS = [250, 500, 1_000, 2_000] as const;

export async function loadProfileWith(
  fetchProfile: () => Promise<ApiResult<Profile>>,
  sleep: (ms: number) => Promise<void>,
): Promise<ProfileLoad> {
  let lastStatus: number | null = null;
  let pending: Profile | null = null;
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    const r = await fetchProfile();
    if (r.ok) {
      if (r.data.status !== "pending") return { kind: "ok", profile: r.data };
      pending = r.data; // members.profile still catching up after member.registered
      lastStatus = null;
    } else {
      lastStatus = r.status;
    }
    // No sleep after the last attempt — nothing follows it.
    if (attempt < BACKOFF_MS.length - 1) {
      const wait = BACKOFF_MS[attempt];
      if (wait !== undefined) await sleep(wait);
    }
  }
  if (pending) return { kind: "ok", profile: pending };
  if (lastStatus === 401) return { kind: "signed-out" };
  return { kind: "unavailable", status: lastStatus ?? 0 };
}

export type RouteTarget = "/sign-in" | "/set-password" | "/onboarding" | "/(tabs)/explore";

export function routeFor(load: ProfileLoad, onboarded: boolean, passwordPending = false): RouteTarget {
  if (load.kind === "signed-out") return "/sign-in";
  if (load.kind === "ok" && load.profile.status === "deleted") return "/sign-in";
  // Path A session has no credential yet. Do not send it to onboarding or Explore.
  if (passwordPending) return "/set-password";
  // Explore renders its own offline / error state and retries; the member stays signed in.
  if (load.kind === "unavailable") return "/(tabs)/explore";
  if (load.profile.homeAirport == null && !onboarded) return "/onboarding";
  return "/(tabs)/explore";
}

/** Whether better-auth's account list holds a password (a "credential" account). Anything unreadable counts as no. */
export function passwordOnFile(accounts: unknown): boolean {
  return (
    Array.isArray(accounts) &&
    accounts.some(
      (a) => typeof a === "object" && a !== null && (a as { providerId?: unknown }).providerId === "credential",
    )
  );
}
