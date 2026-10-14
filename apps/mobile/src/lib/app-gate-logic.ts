import { stateCopy } from "./error-context";

/** `1.2.10` against `1.2.9`: positive when `a` is newer. Missing or non-numeric parts count as 0. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** What /v1/app-config's `maintenance` holds for the app: a non-blank string (the operator's message, or the moment to
 *  come back), or null — anything else is no maintenance at all, never `[object Object]` on screen. */
export function maintenanceValue(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

/**
 * Figma 240:5163: what the maintenance page says. A moment (`2026-10-14T06:00:00Z`) becomes the time to come back, in
 * the member's own time — the day too when it is not today; any other words are the operator's message, as written.
 */
export function maintenanceBody(
  value: string,
  now: Date = new Date(),
  opts: { locale?: string; timeZone?: string } = {},
): string {
  const at = /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(at)) return value || stateCopy("maintenance").body;
  const when = new Date(at);
  const { locale, timeZone } = opts;
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone });
  const time = when.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone });
  const moment =
    day(when) === day(now)
      ? time
      : `${when.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", timeZone })}, ${time}`;
  return `We’re making a few improvements. Please check back at ${moment} your time.`;
}
