import type { Profile } from "@/lib/api";

/** What a profile sheet hands back. PATCH /v1/profile answers with the raw row, which has no `notifications`. */
export type SavedProfile = Omit<Profile, "notifications"> & { notifications?: Profile["notifications"] };

/** The offers switch shows what the member saved — or null while that is unknown (the switch stays disabled).
 *  Never a default. */
export function offersSwitchValue(profile: SavedProfile | null): boolean | null {
  return profile?.notifications?.offers ?? null;
}

/** A sheet saved the profile: take its answer, but keep the notifications the server did not send back. */
export function mergeSavedProfile(prev: Profile, next: SavedProfile): Profile {
  return { ...next, notifications: next.notifications ?? prev.notifications };
}

/** The server accepted a new offers preference. */
export function withOffers(profile: Profile, offers: boolean): Profile {
  return { ...profile, notifications: { ...profile.notifications, offers } };
}
