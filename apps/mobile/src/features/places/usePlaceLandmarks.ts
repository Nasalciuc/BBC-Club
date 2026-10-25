import { useIsFocused } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

import { fetchPlaceLandmarks } from "@/lib/api";

import { createLandmarkStore, landmarksAnswerOf, landmarksIn } from "./landmark-store";

const store = createLandmarkStore(async (code, etag) => landmarksAnswerOf(await fetchPlaceLandmarks(code, etag)));

/**
 * The landmarks of a destination (ADR-IMPL-064), from the store every screen shares: asked when the screen comes into
 * view and what the app knows has aged (`LANDMARKS_FRESH_MS`), revalidated by its ETag. None until the server answers,
 * and none when it cannot (offline, an error): landmarks are a decoration — no error, no placeholder.
 */
export function usePlaceLandmarks(code: string | null | undefined): readonly LandmarkVM[] {
  const focused = useIsFocused();
  // The third argument is the snapshot for a static web render (app.json: web output `static`): the same one.
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const key = code ? code.trim().toUpperCase() : "";

  useEffect(() => {
    if (!focused || !key) return;
    store.want(key).catch(() => undefined);
  }, [focused, key]);

  return landmarksIn(snapshot, key);
}
