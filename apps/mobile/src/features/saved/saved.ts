import { useSyncExternalStore } from "react";

import { appStorage } from "@/lib/storage-keys";

import { isSaved, parseSaved, toggled, type SavedItem, type SavedKind } from "./saved-logic";

/** The member's saved fares and destinations on this phone (ADR-IMPL-056). Cleared on sign-out. */
export const SAVED_KEY = "bbcclub.saved";

const listeners = new Set<() => void>();
// Read on first use, not when the module loads: a static web render has no storage.
let snapshot: SavedItem[] | null = null;
const NONE: SavedItem[] = [];

function read(): SavedItem[] {
  snapshot ??= parseSaved(appStorage.getString(SAVED_KEY));
  return snapshot;
}

function write(next: SavedItem[]): void {
  snapshot = next;
  if (next.length) appStorage.set(SAVED_KEY, JSON.stringify(next));
  else appStorage.remove(SAVED_KEY);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The heart (05) and the bookmark (13): one press saves, the next unsaves. */
export function toggleSaved(kind: SavedKind, id: string): void {
  write(toggled(read(), kind, id, new Date()));
}

/** Sign-out and account deletion: what this member saved does not stay on the phone for the next one. */
export function clearSaved(): void {
  write([]);
}

/** Every saved item, newest first — re-rendered when one is saved or unsaved anywhere. */
export function useSaved(): SavedItem[] {
  return useSyncExternalStore(subscribe, read, () => NONE);
}

export function useIsSaved(kind: SavedKind, id: string | null | undefined): boolean {
  const list = useSaved();
  return id ? isSaved(list, kind, id) : false;
}
