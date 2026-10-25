import { useIsFocused } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

import { fetchPlaceLandmarks } from "@/lib/api";

import { createLandmarkStore, createLoadFailures, landmarksAnswerOf, landmarksIn } from "./landmark-store";

const store = createLandmarkStore(async (code, etag) => landmarksAnswerOf(await fetchPlaceLandmarks(code, etag)));
const loads = createLoadFailures();

export type PlaceLandmarks = {
  /** The city's landmarks: none until the server answers, and none when it cannot. */
  landmarks: readonly LandmarkVM[];
  /** The photographs that would not load, by address: left out until they are tried again. */
  failed: ReadonlySet<string>;
  /** A photograph would not load. */
  onPhotoError: (imageUrl: string) => void;
};

/**
 * The landmarks of a destination (ADR-IMPL-064), from the store every screen shares: asked when the screen comes into
 * view and what the app knows has aged (`LANDMARKS_FRESH_MS`), revalidated by its ETag. None until the server answers,
 * and none when it cannot (offline, an error): landmarks are a decoration — no error, no placeholder. A photograph that
 * would not load is left out until the screen comes back into view or the phone back online (`createLoadFailures`).
 */
export function usePlaceLandmarks(code: string | null | undefined, offline: boolean): PlaceLandmarks {
  const focused = useIsFocused();
  // The third argument is the snapshot for a static web render (app.json: web output `static`): the same one.
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const failed = useSyncExternalStore(loads.subscribe, loads.snapshot, loads.snapshot);
  const key = code ? code.trim().toUpperCase() : "";

  useEffect(() => {
    if (!focused || !key) return;
    store.want(key).catch(() => undefined);
  }, [focused, key]);

  // In view and online — on coming into view, or back online — the photographs that would not load are tried again.
  useEffect(() => {
    if (focused && !offline) loads.retry();
  }, [focused, offline]);

  return { landmarks: landmarksIn(snapshot, key), failed, onPhotoError: loads.fail };
}
