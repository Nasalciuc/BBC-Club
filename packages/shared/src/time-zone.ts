/** A zone name: letters first, then letters, digits and `_ - + /` (`Europe/London`, `UTC`, `Etc/GMT+5`). An offset such
 *  as `+05:00` is not a name: some engines take it and Hermes may not, so the app and the server would disagree. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/** Names asked about, and the clocks built, per process: a few hundred zones at most (ADR-IMPL-075). Past the cap a
 *  name is still checked, only not remembered. */
const REMEMBERED = 1_000;
const known = new Map<string, boolean>();
const clocks = new Map<string, Intl.DateTimeFormat>();

/** True when `tz` is a time-zone name this runtime's clocks can read. The member's zone feeds `Intl.DateTimeFormat`
 *  (quiet hours, campaign fan-out), which throws a RangeError on a name it does not know — one stored bad zone stopped
 *  every broadcast campaign. Not `Intl.supportedValuesOf`: the same check runs in the app on Hermes, which may not have
 *  it, and it leaves out aliases such as `UTC`. The one rule for the server — the catalogue import, the fares' clocks,
 *  quiet hours, the profile — and the app (ADR-IMPL-075). */
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

/** The wall clock in a zone, as numbers' text (`2026`, `10`, `26`, `09`, `05`). */
export type ZoneClock = { year: string; month: string; day: string; hour: string; minute: string };

/**
 * The wall clock at `at` in `timeZone` — never the host's zone. One formatter per zone for the life of the process:
 * building one cost 13 % of a fare's answer (ADR-IMPL-075). Throws a RangeError for a zone that is none, as Intl does;
 * callers pass a zone `isIanaZone` accepted.
 */
export function zoneClock(at: Date, timeZone: string): ZoneClock {
  let f = clocks.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (clocks.size < REMEMBERED) clocks.set(timeZone, f);
  }
  const out: ZoneClock = { year: "", month: "", day: "", hour: "", minute: "" };
  for (const p of f.formatToParts(at)) if (p.type in out) out[p.type as keyof ZoneClock] = p.value;
  return out;
}
