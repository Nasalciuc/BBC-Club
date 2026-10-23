import { useIsFocused } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";

import { fetchProfile, type Profile } from "@/lib/api";

import { profileSnapshot, refreshProfile, subscribeProfile } from "./profile-store";

/**
 * The member's profile from the one store every screen shares (profile-store.ts, F104). Each time a screen comes into
 * view it asks once — joining a question already on its way, so the screens and hooks open together share one GET
 * /v1/profile — and shows the profile already loaded meanwhile (the name, the phone or the usual cabin may have
 * changed on Profile). `load: false` reads only what is there (a confirmation saved offline asks nothing).
 */
export function useProfile(opts: { load?: boolean } = {}): Profile | null {
  const focused = useIsFocused();
  // The third argument is the snapshot for a static web render (app.json: web output `static`): the same profile.
  const profile = useSyncExternalStore(subscribeProfile, profileSnapshot, profileSnapshot);
  const load = opts.load !== false;

  useEffect(() => {
    if (!focused || !load) return;
    void refreshProfile(fetchProfile).catch(() => undefined);
  }, [focused, load]);

  return profile;
}
