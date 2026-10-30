import type { HomeVM } from "@bbc/shared/api/v1/fares";

import type { HomeResult } from "./api";

/** The Home a screen shows and the ETag it came with (ADR-IMPL-075). */
export type ShownHome = { home: HomeVM; etag: string | null };

/**
 * What a screen shows after a GET /v1/home. The client's tag is shared by every screen that reads Home (Explore, Search,
 * `Request received`), but what each shows is its own: a 304 keeps the screen's copy only when that copy came with the
 * very tag the 304 answers — the deals that ran out are already gone from it. Otherwise the answer's copy is shown: a
 * 304 for a tag another screen received brings that screen's newer copy, never this one's older one.
 */
export function nextShownHome(shown: ShownHome | null, answer: HomeResult): ShownHome {
  if (answer.notModified && shown && answer.etag !== null && shown.etag === answer.etag) return shown;
  return { home: answer.home, etag: answer.etag };
}

/**
 * Overlapping loads of one screen — the mount's and a return to the foreground's: only the one started last may change
 * what the screen shows, its loading or its error. An older answer that lands after it — a 304 for an older tag among
 * them, which brings back that tag's older copy — is dropped. `start()` begins a load and gives back whether that load
 * is still the newest.
 */
export function newestOnly(): () => () => boolean {
  let newest = 0;
  return () => {
    const mine = ++newest;
    return () => mine === newest;
  };
}
