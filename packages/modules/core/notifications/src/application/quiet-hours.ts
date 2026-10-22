/** Quiet hours are 22:00–08:00 in the member's local timezone. Transactional bypasses this. */

/** The zone a member has until they set one (members.profile.timezone's default). */
export const DEFAULT_TIME_ZONE = "America/New_York";

/** An IANA zone this runtime knows (`Europe/London`); anything else makes Intl throw a RangeError. */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The member's zone when it is one, else the club's default. A value stored before zones were checked, or any bad row,
 * must never fail a delivery or a page of a campaign: `onInvalid` says so (the caller logs it, with the member).
 */
export function safeTimeZone(tz: string | null | undefined, onInvalid?: () => void): string {
  if (tz && isTimeZone(tz)) return tz;
  onInvalid?.();
  return DEFAULT_TIME_ZONE;
}

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
  const { hour } = localHourMinute(now, safeTimeZone(timeZone));
  return hour >= 22 || hour < 8;
}

/** If `now` is inside quiet hours, return the next local 08:00 as a Date; otherwise `now`. Never throws: a zone that
 *  is not one counts as the club's default (callers pass `safeTimeZone`'s answer, which logs it). */
export function scheduleAfterQuietHours(now: Date, zone: string): Date {
  const timeZone = safeTimeZone(zone);
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
