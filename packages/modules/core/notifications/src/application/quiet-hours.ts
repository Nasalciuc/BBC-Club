/** Quiet hours are 22:00–08:00 in the member's local timezone. Transactional bypasses this. */

function localHourMinute(now: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

export function isInQuietHours(now: Date, timeZone: string): boolean {
  const { hour } = localHourMinute(now, timeZone);
  return hour >= 22 || hour < 8;
}

/** If `now` is inside quiet hours, return the next local 08:00 as a Date; otherwise `now`. */
export function scheduleAfterQuietHours(now: Date, timeZone: string): Date {
  if (!isInQuietHours(now, timeZone)) return now;

  // Walk forward hour-by-hour until local time is 08:00 — DST-safe without an extra tz library.
  let cursor = new Date(now.getTime());
  for (let i = 0; i < 48; i++) {
    cursor = new Date(cursor.getTime() + 30 * 60_000);
    const { hour, minute } = localHourMinute(cursor, timeZone);
    if (hour === 8 && minute < 30) {
      // Snap to the start of the 08:00 half-hour window we landed in.
      return new Date(cursor.getTime() - minute * 60_000);
    }
  }
  return new Date(now.getTime() + 10 * 60 * 60_000); // fallback ~10h
}
