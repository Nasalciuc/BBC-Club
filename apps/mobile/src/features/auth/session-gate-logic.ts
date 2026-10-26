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

/** The phone's zone when the profile's differs (the server's default is America/New_York): quiet hours are the
 *  member's. Null when equal, or when the phone names no place (features/explore/discovery-logic.ts deviceTimeZone). */
export function timezoneToSend(profileZone: string, deviceZone: string | null): string | null {
  return deviceZone && deviceZone !== profileZone ? deviceZone : null;
}

/** A zone PATCH, and the key it is remembered by: one member, one zone. */
export type TimezoneUpdate = { zone: string; key: string };

/**
 * After the gate's own profile load (no extra GET): the zone to PATCH, or null. Only for a living profile (a pending one
 * has no row yet — onboarding sends the zone with the home airport); never twice for the same member and zone in one run
 * of the app (`sent` holds the keys already sent), so a zone the server refuses is not sent again on every navigation —
 * while another member who signs in on this phone in the same run still gets theirs.
 */
export function timezoneUpdate(
  load: ProfileLoad,
  deviceZone: string | null,
  sent: ReadonlySet<string>,
): TimezoneUpdate | null {
  if (load.kind !== "ok" || load.profile.status === "pending" || load.profile.status === "deleted") return null;
  const zone = timezoneToSend(load.profile.timezone, deviceZone);
  if (zone === null) return null;
  const key = `${load.profile.memberId} ${zone}`;
  return sent.has(key) ? null : { zone, key };
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
