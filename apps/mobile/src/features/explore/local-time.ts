/**
 * The destination's own clock (13, 04: `LOCAL TIME` · `14:32` · `London (GMT)`). Display only — `AirportVM.tz` is
 * already dropped by the contract when this runtime cannot format in it, so a missing zone means no clock, never a
 * wrong one.
 */
export type LocalTime = { clock: string; zone: string };

export function localTime(city: string, tz: string | undefined, now: Date = new Date()): LocalTime | null {
  if (!tz) return null;
  let clock: string;
  try {
    clock = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    }).format(now);
  } catch {
    return null; // a zone this runtime does not know
  }
  let abbr: string | undefined;
  try {
    abbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
  } catch {
    abbr = undefined; // the clock still shows; the zone's name is a nicety
  }
  return { clock, zone: abbr ? `${city} (${abbr})` : city };
}

/** Milliseconds until the next whole minute — the clock re-renders exactly when it changes. */
export function msToNextMinute(now: Date = new Date()): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}
