import { isIanaZone } from "@bbc/shared/time-zone";

/** Days from a departure's local date to an arrival's (`2026-10-12` → `2026-10-13`: 1); the dates are Postgres's wall
 *  clocks (fares.repo `wallAt`), so no zone is read here. */
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
