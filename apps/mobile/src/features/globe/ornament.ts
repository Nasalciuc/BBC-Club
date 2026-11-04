import type { Rect } from "@bbc/ui";
import { tokens } from "@bbc/ui/tokens";

/**
 * Mapbox's logo and its (i), which Mapbox's terms keep on the map (ADR-IMPL-035, ADR-IMPL-086): `xs` from the map's
 * edges and `xxs` apart when they share a corner. Their sizes are Mapbox's, not the club's (no token draws them): the
 * larger of the two SDKs' — GL JS's logo 88 × 23 and its compact (i) at least 24 across, the phone's a little smaller.
 */
export const ORNAMENT = {
  inset: tokens.space.xs,
  logo: { width: 88, height: 23 },
  attribution: 24,
  gap: tokens.space.xxs,
} as const;

/**
 * Both in the top-right corner, `top` from the map's top (at rest, ADR-IMPL-086): the box they take, for the globe's
 * labels to keep out of, with `pad` around it.
 */
export function ornamentRect(top: number, width: number, pad = 0): Rect {
  const height = Math.max(ORNAMENT.logo.height, ORNAMENT.attribution);
  return {
    left: width - logoRight() - ORNAMENT.logo.width - pad,
    top: top - pad,
    right: width - ORNAMENT.inset + pad,
    bottom: top + height + pad,
  };
}

/** The logo's distance from the map's right edge when both share the top-right corner: the (i) stands between. */
export function logoRight(): number {
  return ORNAMENT.inset + ORNAMENT.attribution + ORNAMENT.gap;
}

/** How far past the rest size counts as pinched in: the slow turn's ease back lands within it. */
const ZOOM_SLACK = 0.05;

/** The globe pinched in past its rest size (`REST_ZOOM`): it then rises under Explore's header. */
export function isZoomedIn(zoom: number, restZoom: number): boolean {
  return zoom > restZoom + ZOOM_SLACK;
}
