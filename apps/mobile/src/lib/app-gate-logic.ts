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

/** The store listings /v1/app-config names for the update, per platform. */
export type StoreUrl = { ios?: string; android?: string };

/** Where `Update app` goes when the server names no store listing for this platform. */
export const UPDATE_WEBSITE = "https://buybusinessclass.com";

/** A store link (`itms-apps://`, `market://`) or a web page (`https://`): nothing else is opened from the server. */
const STORE_LINK = /^(itms-apps|market|https):\/\/\S+$/i;

/** `storeUrl` as the server sent it, keeping only a platform's link the app may open; anything else is none. */
export function storeUrlValue(raw: unknown): StoreUrl {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StoreUrl = {};
  for (const os of ["ios", "android"] as const) {
    const value = (raw as Record<string, unknown>)[os];
    if (typeof value === "string" && STORE_LINK.test(value.trim())) out[os] = value.trim();
  }
  return out;
}

/** The store's own web page for a store link (`itms-apps://apps.apple.com/…`, `market://details?id=…`), or null. */
function storeWebPage(url: string): string | null {
  if (/^itms-apps:\/\//i.test(url)) return url.replace(/^itms-apps:\/\//i, "https://");
  const market = /^market:\/\/details\?(.+)$/i.exec(url);
  return market ? `https://play.google.com/store/apps/details?${market[1]}` : null;
}

/**
 * What `Update app` tries, in turn (F039): this platform's store listing as the server names it, then that store's own
 * web page (a phone without the store app), then the website — which alone is left when the server names none.
 */
export function updateTargets(config: { storeUrl?: unknown }, os: string): string[] {
  const listings = storeUrlValue(config.storeUrl);
  const store = os === "ios" || os === "android" ? listings[os] : undefined;
  const web = store ? storeWebPage(store) : null;
  return [...new Set([store, web, UPDATE_WEBSITE].filter((url): url is string => Boolean(url)))];
}

export function updateTarget(config: { storeUrl?: unknown }, os: string): string {
  return updateTargets(config, os)[0] ?? UPDATE_WEBSITE;
}

/** Opens the first of `urls` the phone can open; when none opens, nothing more happens. */
export async function openFirst(urls: readonly string[], open: (url: string) => Promise<unknown>): Promise<void> {
  for (const url of urls) {
    try {
      await open(url);
      return;
    } catch {
      // This one cannot be opened here: the next.
    }
  }
}

/** What the gate puts in front of the navigator: the forced update (with the links `Update app` tries), the
 *  maintenance page, or nothing (null). */
export type Gate = { kind: "update"; targets: string[] } | { kind: "maintenance"; value: string } | null;

/** What an answer of /v1/app-config makes of this app (`current`, its version, on `os`): too old, under maintenance, or
 *  open. */
export function gateFor(
  config: { minSupportedVersion: string; maintenance: string | null; storeUrl?: unknown },
  current: string,
  os: string,
): Gate {
  if (compareSemver(config.minSupportedVersion, current) > 0) {
    return { kind: "update", targets: updateTargets(config, os) };
  }
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
