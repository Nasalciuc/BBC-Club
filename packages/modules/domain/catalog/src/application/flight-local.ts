import { isIanaZone, zoneClock } from "@bbc/shared/time-zone";

export type LocalClock = { hhmm: string; ymd: string };

/** Instant → wall clock in an IANA zone. Never uses the host TZ; one formatter per zone (shared/time-zone). */
export function formatInZone(iso: string, timeZone: string): LocalClock {
  const t = zoneClock(new Date(iso), timeZone);
  return { hhmm: `${t.hour}:${t.minute}`, ymd: `${t.year}-${t.month}-${t.day}` };
}

export function calendarDayOffset(departYmd: string, arriveYmd: string): number {
  const a = Date.parse(`${departYmd}T00:00:00Z`);
  const b = Date.parse(`${arriveYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** The import's check is the app's and the profile's (ADR-IMPL-075): a zone name, never an offset. */
export { isIanaZone };

export function assertIanaZone(tz: string): void {
  if (!isIanaZone(tz)) throw new Error(`invalid IANA time zone: ${tz}`);
}
