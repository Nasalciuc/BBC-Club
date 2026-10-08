/**
 * The destination's wall clock, as Figma writes it on the fare list (536:10864): `LONDON · 8:42 PM`. Display only —
 * `AirportVM.tz` is already dropped by the contract when this runtime cannot format in it, so a missing zone means no
 * label, never a wrong one.
 */
export function localTimeLabel(city: string, tz: string | undefined, now: Date = new Date()): string | null {
  if (!tz) return null;
  let time: string;
  try {
    time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(
      now,
    );
  } catch {
    return null; // a zone this runtime does not know
  }
  // Some engines put a narrow no-break space (U+202F) or a no-break space before AM/PM; the mono label wants a plain one.
  return `${city.toUpperCase()} · ${time.replace(/\u202f|\u00a0/g, " ")}`;
}

/** Milliseconds until the next whole minute — the label re-renders exactly when the clock changes. */
export function msToNextMinute(now: Date = new Date()): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}
