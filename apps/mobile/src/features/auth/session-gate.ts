import type { Href } from "expo-router";

import { deviceTimeZone } from "@/features/explore/discovery-logic";
import { fetchProfile, patchProfile } from "@/lib/api";
import { appStorage, ONBOARDED_KEY, PENDING_PASSWORD_KEY } from "@/lib/storage-keys";
import { loadProfileWith, routeFor, timezoneUpdate, type ProfileLoad } from "./session-gate-logic";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const loadProfileAfterAuth = (): Promise<ProfileLoad> => loadProfileWith(fetchProfile, sleep);

export function passwordStillPending(): boolean {
  return appStorage.getBoolean(PENDING_PASSWORD_KEY) === true;
}

export const routeForProfile = (load: ProfileLoad): Href =>
  routeFor(load, appStorage.getBoolean(ONBOARDED_KEY) === true, passwordStillPending()) as Href;

/** The zones sent in this run of the app, per member: once each, refused or not. */
const zonesSent = new Set<string>();

export async function resolvePostAuthRoute(): Promise<Href> {
  const load = await loadProfileAfterAuth();
  // Quiet hours follow the phone's zone — a member who skipped onboarding, or travels, too. Best effort: a failure
  // changes nothing about where the member goes.
  const update = timezoneUpdate(load, deviceTimeZone(), zonesSent);
  if (update) {
    zonesSent.add(update.key);
    await patchProfile({ timezone: update.zone }).catch(() => undefined);
  }
  return routeForProfile(load);
}
