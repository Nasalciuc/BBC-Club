/**
 * Whether the satellite globe may fade in over the drawn one (ADR-IMPL-055, F107). On the preview APK satellite-v9
 * drew only its background (rgb(4,7,14)) — no imagery — and @rnmapbox/maps 10.3.7 on Android never emits
 * onMapLoadingError, so Explore showed a black sphere. Before fading Mapbox in, one raster tile of the satellite imagery
 * is asked for with the token, once per session: Mapbox shows only when its style has loaded AND that tile came back
 * as an image; otherwise the drawn globe stays. ADR-IMPL-068: asked again when the app comes back to the foreground or
 * the phone comes back online, while Mapbox is shown — a failure then hands Explore back to the drawn globe. The token
 * is never logged. JS only — the native bump (10.3.8's tile errors) is separate.
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

/**
 * The probe, asked once per session however many globes mount — or asked again (`fresh`, ADR-IMPL-068) when the app
 * comes back to the foreground or the phone comes back online: the answer then replaces the session's.
 */
export function satelliteTileProbe(
  token: string | undefined,
  deps?: { fetch?: ProbeFetch; timeoutMs?: number },
  opts: { fresh?: boolean } = {},
): Promise<TileProbe> {
  if (opts.fresh || session === null) session = probeSatelliteTile(token, deps);
  return session;
}

/** At most one probe a minute, however often the app comes and goes or the network flaps. */
export const REPROBE_MIN_GAP_MS = 60_000;

/**
 * Whether to ask for the imagery again (ADR-IMPL-068, the black globe's floor): when the app comes back to the
 * foreground or the phone comes back online, while the satellite globe is the one shown — a cache that lost its tiles,
 * or a token revoked meanwhile, would otherwise leave a sphere of the style's background. Its failure hands Explore back
 * to the drawn globe for the session; nothing is asked again once that happened, nor within a minute of the last ask.
 */
export function shouldReprobe(s: {
  /** The app became active, or the phone came back online. */
  came: "foreground" | "online" | null;
  mapboxShown: boolean;
  failed: boolean;
  lastAskedAt: number | null;
  now: number;
}): boolean {
  if (s.came === null || !s.mapboxShown || s.failed) return false;
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
