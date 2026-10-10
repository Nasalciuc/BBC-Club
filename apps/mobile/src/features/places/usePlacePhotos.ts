import { useEffect, useSyncExternalStore } from "react";
import type { PlacePhotoVM } from "@bbc/shared/api/v1/places";

import cabinImage from "@/assets/images/cabin.webp";
import { fetchPlacePhotos } from "@/lib/api";
import { appVersion } from "@/lib/app-meta";
import { env } from "@/lib/env";

import { wikimediaHeaders } from "./place-photo-logic";
import { POLL_MS, createPlacePhotoStore, photoIn } from "./place-photo-store";

/** The club's own image — the last tier, and what shows when a photo cannot load (ADR-IMPL-043). */
export const CLUB_PICTURE: number = cabinImage;

/** Sent with every picture from Wikimedia: its policy refuses an anonymous client. */
export const PICTURE_HEADERS = wikimediaHeaders(appVersion(), env.EXPO_PUBLIC_API_URL);

const store = createPlacePhotoStore(async (codes) => {
  const answer = await fetchPlacePhotos(codes);
  return answer.ok ? { ok: true, data: answer.data } : { ok: false };
});

/**
 * The photos of these cities. Asked once for the session; while shown, a city the server has not looked up yet is
 * asked about again each minute (the server's job finds it within one). Every screen that shows a city shares them.
 * The lookup returned reads the store's current snapshot: it is a new function whenever an answer arrives, so what a
 * screen computed from it (and the React Compiler kept) is computed again.
 */
export function usePlacePhotos(
  codes: readonly (string | null | undefined)[],
): (code: string | null | undefined) => PlacePhotoVM | undefined {
  const key = [...new Set(codes.filter((c): c is string => !!c).map((c) => c.toUpperCase()))].sort().join(",");
  const photos = useSyncExternalStore(store.subscribe, store.snapshot);

  useEffect(() => {
    if (!key) return;
    const wanted = key.split(",");
    const ask = () => {
      store.want(wanted).catch(() => undefined);
    };
    ask();
    const timer = setInterval(ask, POLL_MS);
    return () => clearInterval(timer);
  }, [key]);

  return (code) => photoIn(photos, code);
}
