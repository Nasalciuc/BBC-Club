/**
 * Whether the satellite globe may fade in over the drawn one (ADR-IMPL-055, F107). On the preview APK satellite-v9
 * drew only its background (rgb(4,7,14)) — no imagery — and @rnmapbox/maps 10.3.7 on Android never emits
 * onMapLoadingError, so Explore showed a black sphere. Before fading Mapbox in, one raster tile of the satellite imagery
 * is asked for with the token, once per session: Mapbox shows only when its style has loaded AND that tile came back
 * as an image; otherwise the drawn globe stays. ADR-IMPL-068: asked again when the app comes back to the foreground or
 * the phone comes back online, while Mapbox is shown and the phone is online — only a refused token then hands Explore
 * back to the drawn globe. The token is never logged. JS only — the native bump (10.3.8's tile errors) is separate.
 */
import { timeoutSignal } from "../../lib/timeout";

export type TileProbe = "pending" | "ok" | "failed";

/** The world's single tile at zoom 0 — the smallest question the satellite imagery answers. */
const TILE_PROBE = "https://api.mapbox.com/v4/mapbox.satellite/0/0/0@2x.jpg90";
export const TILE_PROBE_TIMEOUT_MS = 5000;

export function shouldShowMapbox(s: { styleLoaded: boolean; tileProbe: TileProbe }): boolean {
  return s.styleLoaded && s.tileProbe === "ok";
}

export function tileProbeUrl(token: string): string {
  return `${TILE_PROBE}?access_token=${encodeURIComponent(token)}`;
}

type ProbeAnswer = { status: number; headers: { get: (name: string) => string | null } };
type ProbeFetch = (url: string, init: { signal: AbortSignal }) => Promise<ProbeAnswer>;

/** A tile is an image answered 200; a refused token answers JSON (401/403), a blocked network nothing. */
export function readTileProbe(res: ProbeAnswer): TileProbe {
  const type = res.headers.get("content-type") ?? "";
  return res.status === 200 && type.toLowerCase().startsWith("image/") ? "ok" : "failed";
}

export async function probeSatelliteTile(
  token: string | undefined,
  deps: { fetch?: ProbeFetch; timeoutMs?: number } = {},
): Promise<TileProbe> {
  if (!token) return "failed";
  const ask: ProbeFetch = deps.fetch ?? ((url, init) => fetch(url, { signal: init.signal }));
  const own = timeoutSignal(deps.timeoutMs ?? TILE_PROBE_TIMEOUT_MS);
  try {
    return readTileProbe(await ask(tileProbeUrl(token), { signal: own.signal }));
  } catch {
    // Offline, blocked, timed out: no imagery to show. Nothing is logged — the URL carries the token.
    return "failed";
  } finally {
    own.cancel();
  }
}

let session: Promise<TileProbe> | null = null;

/** The probe, asked once per session however many globes mount. */
export function satelliteTileProbe(
  token: string | undefined,
  deps?: { fetch?: ProbeFetch; timeoutMs?: number },
): Promise<TileProbe> {
  session ??= probeSatelliteTile(token, deps);
  return session;
}

/**
 * What asking again found (ADR-IMPL-068): the imagery came; the token was refused — Mapbox answered 401 or 403, so no
 * new tile will come; or nothing to go by — no answer (offline, a timeout), the server's own trouble, a captive
 * portal's page. Only a refusal is a reason to leave the satellite globe: otherwise Mapbox draws what it has cached,
 * and the ocean (the recoloured background) where a tile is missing, never black.
 */
export type Reprobe = "ok" | "refused" | "unknown";

export function readReprobe(res: ProbeAnswer): Reprobe {
  if (readTileProbe(res) === "ok") return "ok";
  return res.status === 401 || res.status === 403 ? "refused" : "unknown";
}

/**
 * The probe asked again, on return or reconnect. An answer replaces the session's — a refusal, so a globe mounted later
 * stays drawn; the imagery, so it shows — and anything short of one leaves the session's as it was.
 */
export async function reprobeSatelliteTile(
  token: string | undefined,
  deps: { fetch?: ProbeFetch; timeoutMs?: number } = {},
): Promise<Reprobe> {
  if (!token) return "refused";
  const ask: ProbeFetch = deps.fetch ?? ((url, init) => fetch(url, { signal: init.signal }));
  const own = timeoutSignal(deps.timeoutMs ?? TILE_PROBE_TIMEOUT_MS);
  let found: Reprobe;
  try {
    found = readReprobe(await ask(tileProbeUrl(token), { signal: own.signal }));
  } catch {
    // Offline, blocked, timed out: nothing learnt. Nothing is logged — the URL carries the token.
    found = "unknown";
  } finally {
    own.cancel();
  }
  if (found !== "unknown") session = Promise.resolve(found === "ok" ? "ok" : "failed");
  return found;
}

/** At most one probe a minute, however often the app comes and goes or the network flaps. */
export const REPROBE_MIN_GAP_MS = 60_000;

/**
 * Whether to ask for the imagery again (ADR-IMPL-068, the black globe's floor): when the app comes back to the
 * foreground or the phone comes back online, while the satellite globe is the one shown — a token revoked meanwhile
 * would otherwise leave Mapbox drawing only what it had cached. Never while offline: the question could only go
 * unanswered, and coming back online asks it. Nothing is asked once Explore was handed back to the drawn globe, nor
 * within a minute of the last ask.
 */
export function shouldReprobe(s: {
  /** The app became active, or the phone came back online. */
  came: "foreground" | "online" | null;
  offline: boolean;
  mapboxShown: boolean;
  failed: boolean;
  lastAskedAt: number | null;
  now: number;
}): boolean {
  if (s.came === null || s.offline || !s.mapboxShown || s.failed) return false;
  return s.lastAskedAt === null || s.now - s.lastAskedAt >= REPROBE_MIN_GAP_MS;
}

/** What changed for the globe: the app came back to the foreground, the phone came back online, or nothing. */
export function cameBack(
  before: { active: boolean; offline: boolean },
  after: { active: boolean; offline: boolean },
): "foreground" | "online" | null {
  if (!before.active && after.active) return "foreground";
  if (before.offline && !after.offline) return "online";
  return null;
}

/** Tests: a new session. */
export function resetTileProbe(): void {
  session = null;
}
