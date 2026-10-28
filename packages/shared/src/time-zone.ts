/** A zone name: letters first, then letters, digits and `_ - + /` (`Europe/London`, `UTC`, `Etc/GMT+5`). An offset such
 *  as `+05:00` is not a name: some engines take it and Hermes may not, so the app and the server would disagree. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/** Names asked about, and the clocks built, per process: a few hundred zones at most (ADR-IMPL-075). Past the cap a
 *  name is still checked, only not remembered. */
const REMEMBERED = 1_000;
const known = new Map<string, boolean>();
const clocks = new Map<string, Intl.DateTimeFormat>();
/** A day's bounds per zone (`zoneDayBounds`), as many as REMEMBERED: a dated search asks the same few days of the same
 *  zones again and again. Days move on, so past the cap the oldest goes, not the new one. */
const dayBounds = new Map<string, { start: number; end: number }>();

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

/**
 * The instants a calendar day `ymd` (`2026-10-26`) of `timeZone` spans: [start, end), where start is the first instant
 * whose wall clock in the zone shows that date and end the first that shows the next one — what Postgres reads as
 * `(t AT TIME ZONE zone)::date = ymd`, by this runtime's zone rules (ICU; in the zones `scripts/tz-parity.test.ts`
 * lists, an hour off Postgres's tzdata), so a column compared to the two bounds needs no zone per row (ADR-IMPL-077).
 * A day whose midnight does not exist (a clock that springs forward at 00:00) starts when the clock reaches it; a day
 * of 23 or 25 hours spans 23 or 25. Found by bisection on the zone's clock, to the millisecond, once per zone and day
 * for the life of the process (`dayBounds`: about 190 µs a day's bounds, under 1 µs remembered); each call gets its
 * own Dates.
 */
export function zoneDayBounds(ymd: string, timeZone: string): { start: Date; end: Date } {
  const key = `${timeZone}|${ymd}`;
  const hit = dayBounds.get(key);
  if (hit) return { start: new Date(hit.start), end: new Date(hit.end) };
  const bounds = findDayBounds(ymd, timeZone);
  if (dayBounds.size >= REMEMBERED) dayBounds.delete(dayBounds.keys().next().value as string);
  dayBounds.set(key, { start: bounds.start.getTime(), end: bounds.end.getTime() });
  return bounds;
}

function findDayBounds(ymd: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const firstOf = (year: number, month: number, day: number): Date => {
    const target = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const utcMidnight = Date.UTC(year, month - 1, day);
    // Every zone is within 15 hours of UTC: the day's first instant lies in this window.
    let lo = utcMidnight - 15 * 3_600_000;
    let hi = utcMidnight + 15 * 3_600_000;
    const dateAt = (t: number) => {
      const c = zoneClock(new Date(t), timeZone);
      return `${c.year}-${c.month}-${c.day}`;
    };
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (dateAt(mid) >= target) hi = mid;
      else lo = mid;
    }
    return new Date(hi);
  };
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    start: firstOf(y, m, d),
    end: firstOf(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  };
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
