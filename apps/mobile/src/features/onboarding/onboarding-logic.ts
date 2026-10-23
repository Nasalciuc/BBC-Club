import type { ProfilePatchBody } from "@bbc/shared/api/v1/proposals";

/**
 * Onboarding's PATCH /v1/profile: the home airport, with the phone's zone when it names a place — without it the server
 * keeps America/New_York, and every member's quiet hours would be New York's.
 */
export function onboardingProfilePatch(homeAirport: string, deviceZone: string | null): ProfilePatchBody {
  return deviceZone ? { homeAirport, timezone: deviceZone } : { homeAirport };
}

/**
 * A body with a zone the server refused (400): the airport alone, so a zone it will not take never holds the member on
 * onboarding (the gate offers the zone again later, session-gate.ts). Null: the answer stands.
 */
export function retryWithoutTimezone(
  body: ProfilePatchBody,
  result: { ok: true } | { ok: false; status: number },
): ProfilePatchBody | null {
  if (result.ok || result.status !== 400 || body.timezone === undefined || body.homeAirport === undefined) return null;
  return { homeAirport: body.homeAirport };
}
