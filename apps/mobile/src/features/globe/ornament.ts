import type { Rect } from "@bbc/ui";

/**
 * Mapbox's logo and its (i), which Mapbox's terms keep on the map (ADR-IMPL-035, ADR-IMPL-086): 8 pt from the map's
 * edges, the logo about 85 × 21 and the (i) 22 across, 4 apart when they share a corner.
 */
export const ORNAMENT = { inset: 8, logo: { width: 85, height: 21 }, attribution: 22, gap: 4 } as const;

/**
 * Both in the top-right corner, `top` from the map's top (at rest, ADR-IMPL-086): the box they take, for the globe's
 * labels to keep out of, with `pad` around it.
 */
export function ornamentRect(top: number, width: number, pad = 0): Rect {
  const height = Math.max(ORNAMENT.logo.height, ORNAMENT.attribution);
  return {
    left: width - ORNAMENT.inset - ORNAMENT.attribution - ORNAMENT.gap - ORNAMENT.logo.width - pad,
    top: top - pad,
    right: width - ORNAMENT.inset + pad,
    bottom: top + height + pad,
  };
}

/** How far past the rest size counts as pinched in: the slow turn's ease back lands within it. */
const ZOOM_SLACK = 0.05;

/** The globe pinched in past its rest size (`REST_ZOOM`): it then rises under Explore's header. */
export function isZoomedIn(zoom: number, restZoom: number): boolean {
  return zoom > restZoom + ZOOM_SLACK;
}
