/** A zone name: letters first, then letters, digits and `_ - + /` (`Europe/London`, `UTC`, `Etc/GMT+5`). An offset such
 *  as `+05:00` is not a name: some engines take it and Hermes may not, so the app and the server would disagree. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/** Names asked about, per process: a few hundred zones at most (ADR-IMPL-075). Past the cap a name is still checked,
 *  only not remembered. */
const REMEMBERED = 1_000;
/** Odd names remembered at most this many: names that are no zone, and zones not spelled as Intl spells them
 *  (`europe/london`, `EUROPE/London`). Anyone can send either in a profile, and a stream of them — every case variant of
 *  one zone is a name of its own — would otherwise fill the map and leave the real zones checked again on every call. */
const ODD_REMEMBERED = 100;
const known = new Map<string, boolean>();
let oddKept = 0;

/** True when `tz` is a time-zone name the app's and the server's clocks can read — the name only: the club reads a
 *  zone's rules (a day's bounds, a fare's clocks, quiet hours) from Postgres's tzdata (#114, ADR-IMPL-077 §5). Not
 *  `Intl.supportedValuesOf`: the same check runs in the app on Hermes, which may not have it, and it leaves out aliases
 *  such as `UTC`. The one rule for the server — the catalogue import, the profile, quiet hours — and the app
 *  (ADR-IMPL-075). */
export function isIanaZone(tz: string): boolean {
  const hit = known.get(tz);
  if (hit !== undefined) return hit;
  let ok = false;
  let spelled = false;
  if (ZONE_NAME.test(tz)) {
    try {
      const resolved = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
      ok = resolved.length > 0;
      spelled = resolved === tz;
    } catch {
      ok = false;
    }
  }
  const odd = !ok || !spelled;
  if (known.size < REMEMBERED && (!odd || oddKept < ODD_REMEMBERED)) {
    known.set(tz, ok);
    if (odd) oddKept++;
  }
  return ok;
}

/** How many names this process remembers: all, and the odd ones — no zone, or a zone spelled otherwise (tests). */
export function zoneNamesKept(): { all: number; odd: number } {
  return { all: known.size, odd: oddKept };
}
