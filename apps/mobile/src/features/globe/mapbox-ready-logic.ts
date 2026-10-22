/**
 * Whether the satellite globe may fade in over the drawn one (ADR-IMPL-055, F107). On the preview APK satellite-v9
 * drew only its background (rgb(4,7,14)) — no imagery — and @rnmapbox/maps 10.3.7 on Android never emits
 * onMapLoadingError, so Explore showed a black sphere. Before fading Mapbox in, one raster tile of the satellite imagery
 * is asked for with the token, once per session: Mapbox shows only when its style has loaded AND that tile came back
 * as an image; otherwise the drawn globe stays. The token is never logged. JS only — the native bump is separate.
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

/** Tests: a new session. */
export function resetTileProbe(): void {
  session = null;
}
