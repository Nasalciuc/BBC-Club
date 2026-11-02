/**
 * The globe's clouds move (ADR-IMPL-085, the owner's ask: as air masses would). Not the weather: our own clouds
 * (`scripts/globe-clouds.py`), two moments of one sky that fade into each other while three bands of it slide at the
 * winds' own pace and way — east in the westerlies of both hemispheres, west in the tropics' trade winds. The bands
 * overlap, each fading out across the overlap as its neighbour fades in, so where they part the clouds blur rather
 * than tear. Pure: where each picture lies and how much it shows at a moment; MapboxGlobe(.web).tsx draws it.
 *
 * No imports: the unit tests run from the repository's root (ADR-IMPL-083).
 */

/** Web Mercator's last latitude: the pictures run pole to pole as far as the map goes. */
const MAX_LAT = 85.0511287798066;

export type CloudBand = "north" | "tropics" | "south";
export type CloudSlice = "a" | "b";

/**
 * Each band's picture, its north and south edges, and its drift in degrees of longitude a second (east positive). The
 * westerlies run some 0.1°/s here — a cloud crosses Europe in a few minutes, against the globe's own turn of 3°/s;
 * the trades half as fast, the other way. The edges match the generator's (`BANDS`, `OVERLAP` in globe-clouds.py).
 */
export const CLOUD_BANDS: Readonly<Record<CloudBand, { north: number; south: number; drift: number }>> = {
  north: { north: MAX_LAT, south: 14, drift: 0.11 },
  tropics: { north: 26, south: -26, drift: -0.06 },
  south: { north: -14, south: -MAX_LAT, drift: 0.09 },
};

/** One sky's change into the other and back: slow enough to read as clouds forming and thinning, never as a blink. */
export const CLOUD_MORPH_S = 150;

/** How often the clouds are moved on: twice a second is under a third of a point a step at the globe's centre. */
export const CLOUD_TICK_MS = 500;

export type CloudLayer = {
  id: `clouds-${CloudSlice}-${CloudBand}`;
  slice: CloudSlice;
  band: CloudBand;
  /** Top left, top right, bottom right, bottom left — as Mapbox's image source takes them. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  opacity: number;
};

/** The pictures' order, bottom to top: `a` under `b`, each band in turn. */
export const CLOUD_LAYER_IDS: readonly CloudLayer["id"][] = (["a", "b"] as const).flatMap((slice) =>
  (["north", "tropics", "south"] as const).map((band) => `clouds-${slice}-${band}` as const),
);

/** How far a band has drifted after `t` seconds, kept within one turn so the numbers stay small. */
export function bandShift(band: CloudBand, t: number): number {
  const shift = (CLOUD_BANDS[band].drift * t) % 360;
  return shift < 0 ? shift + 360 : shift;
}

/** How much of `b` shows at `t` (0..1): from nothing at the start, all of it half a cycle on, and back. */
export function morph(t: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / CLOUD_MORPH_S);
}

/**
 * Where each picture lies and how much of it shows, `t` seconds after the clouds began to move. A picture spans a whole
 * turn of longitude from its shift; past 180° Mapbox carries it round the globe. Opacities sum to one: `a` and `b`
 * share the sky, never doubling it.
 */
export function cloudLayers(t: number): CloudLayer[] {
  const b = morph(t);
  return CLOUD_LAYER_IDS.map((id) => {
    const [, slice, band] = id.split("-") as ["clouds", CloudSlice, CloudBand];
    const { north, south } = CLOUD_BANDS[band];
    const west = -180 + bandShift(band, t);
    const east = west + 360;
    return {
      id,
      slice,
      band,
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
      opacity: slice === "a" ? 1 - b : b,
    };
  });
}
