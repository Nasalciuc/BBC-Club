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
