/** A zone name: letters first, then letters, digits and `_ - + /` (`Europe/London`, `UTC`, `Etc/GMT+5`). An offset such
 *  as `+05:00` is not a name: some engines take it and Hermes may not, so the app and the server would disagree. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/** Names asked about, per process: a few hundred zones at most (ADR-IMPL-075). Past the cap a name is still checked,
 *  only not remembered. */
const REMEMBERED = 1_000;
const known = new Map<string, boolean>();

/** True when `tz` is a time-zone name the app's and the server's clocks can read — the name only: the club reads a
 *  zone's rules (a day's bounds, a fare's clocks, quiet hours) from Postgres's tzdata (#114, ADR-IMPL-077 §5). Not
 *  `Intl.supportedValuesOf`: the same check runs in the app on Hermes, which may not have it, and it leaves out aliases
 *  such as `UTC`. The one rule for the server — the catalogue import, the profile, quiet hours — and the app
 *  (ADR-IMPL-075). */
export function isIanaZone(tz: string): boolean {
  const hit = known.get(tz);
  if (hit !== undefined) return hit;
  let ok = false;
  if (ZONE_NAME.test(tz)) {
    try {
      ok = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone.length > 0;
    } catch {
      ok = false;
    }
  }
  if (known.size < REMEMBERED) known.set(tz, ok);
  return ok;
}
