import type { Href } from "expo-router";

import { fetchProfile } from "@/lib/api";
import { appStorage, ONBOARDED_KEY, PENDING_PASSWORD_KEY } from "@/lib/storage-keys";
import { loadProfileWith, routeFor, type ProfileLoad } from "./session-gate-logic";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const loadProfileAfterAuth = (): Promise<ProfileLoad> => loadProfileWith(fetchProfile, sleep);

export function passwordStillPending(): boolean {
  return appStorage.getBoolean(PENDING_PASSWORD_KEY) === true;
}

export const routeForProfile = (load: ProfileLoad): Href =>
  routeFor(load, appStorage.getBoolean(ONBOARDED_KEY) === true, passwordStillPending()) as Href;

export async function resolvePostAuthRoute(): Promise<Href> {
  return routeForProfile(await loadProfileAfterAuth());
}
