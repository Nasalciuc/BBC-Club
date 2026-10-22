export type LocalClock = { hhmm: string; ymd: string };

/** Instant → wall clock in an IANA zone. Never uses the host TZ. */
export function formatInZone(iso: string, timeZone: string): LocalClock {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { hhmm: `${get("hour")}:${get("minute")}`, ymd: `${get("year")}-${get("month")}-${get("day")}` };
}

export function calendarDayOffset(departYmd: string, arriveYmd: string): number {
  const a = Date.parse(`${departYmd}T00:00:00Z`);
  const b = Date.parse(`${arriveYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** The same check, as a yes or no (the import names the row of a zone that is none). */
export function isIanaZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function assertIanaZone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
  } catch {
    throw new Error(`invalid IANA time zone: ${tz}`);
  }
}
