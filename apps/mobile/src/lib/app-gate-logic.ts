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

/** What the gate puts in front of the navigator: the forced update, the maintenance page, or nothing (null). */
export type Gate = { kind: "update" } | { kind: "maintenance"; value: string } | null;

/** What an answer of /v1/app-config makes of this app (`current`, its version): too old, under maintenance, or open. */
export function gateFor(config: { minSupportedVersion: string; maintenance: string | null }, current: string): Gate {
  if (compareSemver(config.minSupportedVersion, current) > 0) return { kind: "update" };
  if (config.maintenance) return { kind: "maintenance", value: config.maintenance };
  return null;
}

/** After an answer, a return to the app asks again once this has passed. */
export const GATE_FRESH_MS = 5 * 60_000;
/** After the n-th failure in a row, the next try (5 s, 30 s, 2 min); past those, the next return to the app asks. */
const GATE_RETRY_MS = [5_000, 30_000, 120_000] as const;

export function gateRetryDelayMs(attempts: number): number | null {
  return attempts >= 1 ? (GATE_RETRY_MS[attempts - 1] ?? null) : null;
}

/**
 * Whether the gate asks /v1/app-config again (F033): it asked once per process, so a first answer that failed or was
 * slow left the app ungated until a cold start, and a raised minimum never reached a running app. `retry`: the timer
 * after a failure (`attempts` in a row), due at 5 s, 30 s and 2 min. `foreground`: the app came back to the front —
 * asked when the last try failed (or none was made), or when the last answer is five minutes old.
 */
export function shouldRecheck(s: {
  lastOkAt: number | null;
  lastFailedAt: number | null;
  attempts: number;
  now: number;
  trigger: "retry" | "foreground";
}): boolean {
  const failedLast = s.lastFailedAt !== null && (s.lastOkAt === null || s.lastFailedAt >= s.lastOkAt);
  if (s.trigger === "retry") {
    const wait = gateRetryDelayMs(s.attempts);
    return failedLast && wait !== null && s.now - (s.lastFailedAt ?? s.now) >= wait;
  }
  if (failedLast || s.lastOkAt === null) return true;
  return s.now - s.lastOkAt >= GATE_FRESH_MS;
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
