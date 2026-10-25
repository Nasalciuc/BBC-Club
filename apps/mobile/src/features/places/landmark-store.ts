/**
 * The landmarks of the destinations the app has shown, for this session (ADR-IMPL-064), one question a city: GET
 * /v1/places/:code/landmarks with the ETag of what the app holds, so an unchanged answer is a 304. A city is asked
 * about again — when a screen showing it comes into view — only once what the app knows has aged: landmarks after
 * twelve hours (the place photos' own), none yet after five minutes (the server's job looks at a new city within a few),
 * a code the server does not know or an answer this app cannot read after an hour. A failed question (offline, a
 * timeout, the server's error, a 429) changes nothing: the screen shows what it showed, and the next view asks again.
 * The snapshot is immutable and replaced only when a city's landmarks change. Pure: the question is passed in.
 */
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

import { sameLandmarks } from "./landmark-logic";

export type LandmarksAnswer =
  | { ok: true; notModified: true; etag: string | null }
  | { ok: true; notModified: false; landmarks: readonly LandmarkVM[]; etag: string | null }
  /** `unknown`: no such airport (404); `unreadable`: a body this app cannot read; `failed`: anything else. */
  | { ok: false; reason: "unknown" | "unreadable" | "failed" };

export type LandmarkSnapshot = ReadonlyMap<string, readonly LandmarkVM[]>;

/** How long what the app knows about a city stays fresh. */
export const LANDMARKS_FRESH_MS = { found: 12 * 3_600_000, none: 5 * 60_000, unknown: 3_600_000 } as const;

type Kind = keyof typeof LANDMARKS_FRESH_MS;
type Known = { etag: string | null; at: number; kind: Kind };

const NONE: readonly LandmarkVM[] = Object.freeze([]);

/** An API answer as the store reads it: 404 — no such airport; a body the app cannot read; any other failure. */
export function landmarksAnswerOf(
  result:
    | {
        ok: true;
        data:
          | { notModified: true; etag: string | null }
          | { notModified: false; landmarks: readonly LandmarkVM[]; etag: string | null };
      }
    | { ok: false; status: number; code?: string },
): LandmarksAnswer {
  if (result.ok) return { ok: true, ...result.data };
  if (result.status === 404) return { ok: false, reason: "unknown" };
  if (result.code === "VALIDATION") return { ok: false, reason: "unreadable" };
  return { ok: false, reason: "failed" };
}

/** The landmarks the snapshot holds for a city: none until the server has answered. */
export function landmarksIn(snapshot: LandmarkSnapshot, code: string | null | undefined): readonly LandmarkVM[] {
  return code ? (snapshot.get(code.trim().toUpperCase()) ?? NONE) : NONE;
}

export function createLandmarkStore(
  ask: (code: string, etag: string | null) => Promise<LandmarksAnswer>,
  now: () => number = Date.now,
) {
  let entries: LandmarkSnapshot = new Map();
  const known = new Map<string, Known>();
  const asking = new Set<string>();
  const listeners = new Set<() => void>();

  function put(code: string, landmarks: readonly LandmarkVM[]) {
    const before = entries.get(code);
    if (before && sameLandmarks(before, landmarks)) return false;
    const next = new Map(entries);
    next.set(code, landmarks);
    entries = next;
    return true;
  }

  return {
    /** The same object until an answer changes it (for useSyncExternalStore). */
    snapshot(): LandmarkSnapshot {
      return entries;
    },

    /** Asks about a city not known or aged, not already being asked about; resolves when the answer is in. */
    async want(raw: string): Promise<void> {
      const code = raw.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code) || asking.has(code)) return;
      const before = known.get(code);
      if (before && now() - before.at < LANDMARKS_FRESH_MS[before.kind]) return;
      asking.add(code);
      let changed = false;
      try {
        const asked = now();
        const answer = await ask(code, before?.etag ?? null);
        if (answer.ok && answer.notModified) {
          // Unchanged: what the app holds stays, fresh again. A 304 to a question sent without an ETag tells nothing.
          if (before) known.set(code, { ...before, etag: answer.etag ?? before.etag, at: asked });
        } else if (answer.ok) {
          const landmarks = Object.freeze([...answer.landmarks]);
          known.set(code, { etag: answer.etag, at: asked, kind: landmarks.length > 0 ? "found" : "none" });
          changed = put(code, landmarks);
        } else if (answer.reason !== "failed") {
          // No such airport, or an answer this app cannot read: nothing to show, and not asked again for an hour.
          known.set(code, { etag: null, at: asked, kind: "unknown" });
          changed = put(code, NONE);
        }
      } finally {
        asking.delete(code);
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

const NO_FAILURES: ReadonlySet<string> = new Set();

/**
 * The landmark photographs that would not load, by address: each leaves the screen with its name and credit — no empty
 * frame — until it is tried again, when a screen showing landmarks comes back into view or the phone back online (a
 * weak connection, a timeout or Wikimedia's 429 is never for good); one that fails again leaves again. Shared by every
 * screen, as the landmarks are. The snapshot is immutable and replaced only when it changes.
 */
export function createLoadFailures() {
  let failed: ReadonlySet<string> = NO_FAILURES;
  const listeners = new Set<() => void>();

  function set(next: ReadonlySet<string>) {
    failed = next;
    for (const listener of listeners) listener();
  }

  return {
    /** The same object until a photograph fails or every one is tried again (for useSyncExternalStore). */
    snapshot(): ReadonlySet<string> {
      return failed;
    },

    /** A photograph that would not load: left out from now on. */
    fail(imageUrl: string): void {
      if (!failed.has(imageUrl)) set(new Set([...failed, imageUrl]));
    },

    /** Every photograph left out is tried again. */
    retry(): void {
      if (failed.size > 0) set(NO_FAILURES);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
