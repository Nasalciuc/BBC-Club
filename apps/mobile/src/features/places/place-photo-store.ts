/**
 * The photos of the cities the app has shown, for this session (ADR-IMPL-043). One question for up to twenty cities;
 * a city is asked about again only when what the app knows has aged: a photo or a satellite view after twelve hours, a
 * city the server has not looked up yet before the next minute's look, a code the server left out (not an airport, or
 * photos turned off) after an hour. A failed question changes nothing — the next one asks again. What the app knows is
 * an immutable snapshot, replaced on each answer, so a screen that remembers what it drew sees the change. Pure: the
 * question is passed in.
 */
import type { PlacePhotoVM } from "@bbc/shared/api/v1/places";
import { PLACE_PHOTOS_MAX_CODES } from "@bbc/shared/api/v1/places";

export type PhotoAnswer = { ok: true; data: PlacePhotoVM[] } | { ok: false };

/** null — the server left the code out. `at`: when the question was asked. */
export type Entry = { vm: PlacePhotoVM | null; at: number };
export type PhotoSnapshot = ReadonlyMap<string, Entry>;

/** While a city is shown, the app looks again this often. */
export const POLL_MS = 60_000;
/** A city not looked up yet is due again before the next look; the server's job finds it within a minute. */
export const FRESH_MS = { found: 12 * 3_600_000, pending: 50_000, unknown: 3_600_000 } as const;

export function isFresh(entry: Entry | undefined, now: number): boolean {
  if (!entry) return false;
  const ttl = entry.vm === null ? FRESH_MS.unknown : entry.vm.kind === "none" ? FRESH_MS.pending : FRESH_MS.found;
  return now - entry.at < ttl;
}

/** The photo the snapshot holds for a city, if any. */
export function photoIn(snapshot: PhotoSnapshot, code: string | null | undefined): PlacePhotoVM | undefined {
  return code ? (snapshot.get(code.toUpperCase())?.vm ?? undefined) : undefined;
}

export function createPlacePhotoStore(ask: (codes: string[]) => Promise<PhotoAnswer>, now: () => number = Date.now) {
  let entries: PhotoSnapshot = new Map();
  const asking = new Set<string>();
  const listeners = new Set<() => void>();

  return {
    /** The same object until an answer changes it (for useSyncExternalStore). */
    snapshot(): PhotoSnapshot {
      return entries;
    },

    /** Asks about the cities not known or aged, not already being asked about; resolves when every answer is in. */
    async want(codes: readonly string[]): Promise<void> {
      const t = now();
      const due = [...new Set(codes.map((c) => c.toUpperCase()))].filter(
        (c) => /^[A-Z]{3}$/.test(c) && !asking.has(c) && !isFresh(entries.get(c), t),
      );
      if (due.length === 0) return;
      for (const c of due) asking.add(c);
      let changed = false;
      try {
        for (let i = 0; i < due.length; i += PLACE_PHOTOS_MAX_CODES) {
          const chunk = due.slice(i, i + PLACE_PHOTOS_MAX_CODES);
          const asked = now();
          const answer = await ask(chunk);
          if (!answer.ok) continue;
          const byCode = new Map(answer.data.map((vm) => [vm.code, vm]));
          const next = new Map(entries);
          for (const c of chunk) next.set(c, { vm: byCode.get(c) ?? null, at: asked });
          entries = next;
          changed = true;
        }
      } finally {
        for (const c of due) asking.delete(c);
        if (changed) for (const listener of listeners) listener();
      }
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
