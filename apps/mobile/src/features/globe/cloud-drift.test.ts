import { describe, expect, it } from "bun:test";

import { CLOUD_BANDS, CLOUD_LAYER_IDS, CLOUD_MORPH_S, bandShift, cloudLayers, morph } from "./cloud-drift";

/**
 * The tile Mapbox GL JS 3.33 holds an image source in (`getCoordinatesCenterTileID`, src/source/image_source.ts): the
 * zoom at which the image fits one tile, the tile under its middle. On the globe only the world's tiles are drawn.
 */
function centreTile(coordinates: readonly (readonly [number, number])[]): [number, number, number] {
  const xs = coordinates.map(([lng]) => (lng + 180) / 360);
  const ys = coordinates.map(([, lat]) => {
    const phi = (lat * Math.PI) / 180;
    return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
  });
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = Math.max(0, Math.floor(-Math.log2(Math.max(maxX - minX, maxY - minY))));
  const tiles = 2 ** zoom;
  let x = Math.floor(((minX + maxX) / 2) * tiles);
  if (x > 1) x -= 1;
  return [zoom, x, Math.floor(((minY + maxY) / 2) * tiles)];
}

describe("the globe's clouds move as the winds would (ADR-IMPL-085)", () => {
  it("start where the generator drew them: two turns from -540°, the second over the world", () => {
    for (const c of cloudLayers(0)) {
      const [[west, north], [east], [, south]] = c.coordinates;
      expect(west).toBe(-540);
      expect(east).toBe(180);
      expect(north).toBe(CLOUD_BANDS[c.band].north);
      expect(south).toBe(CLOUD_BANDS[c.band].south);
    }
  });

  it("cover the whole world at every moment, each picture in the world's own tile (zoom 0, 0/0)", () => {
    // 0.5 s is the first tick: the trades have drifted 0.03° west, a shift of 359.97°.
    const moments = [0, 0.5, 1, 499.5, 1636.5, 3000, 3272.5, 3600, 6000, 86_400 * 7];
    for (let t = 0; t <= 6000; t += 37.25) moments.push(t);
    for (const t of moments) {
      for (const c of cloudLayers(t)) {
        const [[west], [east]] = c.coordinates;
        expect(east - west).toBeCloseTo(720, 9);
        expect(west).toBeLessThanOrEqual(-180);
        expect(east).toBeGreaterThanOrEqual(180);
        const middle = (west + east) / 2;
        expect(middle).toBeGreaterThanOrEqual(-180);
        expect(middle).toBeLessThan(180);
        expect(centreTile(c.coordinates)).toEqual([0, 0, 0]);
      }
    }
  });

  it("drift east in the westerlies of both hemispheres and west in the trades", () => {
    expect(CLOUD_BANDS.north.drift).toBeGreaterThan(0);
    expect(CLOUD_BANDS.south.drift).toBeGreaterThan(0);
    expect(CLOUD_BANDS.tropics.drift).toBeLessThan(0);
    const later = cloudLayers(100);
    const west = (band: string) => later.find((c) => c.slice === "a" && c.band === band)!.coordinates[0][0];
    expect(west("north")).toBeCloseTo(-540 + 100 * CLOUD_BANDS.north.drift, 6);
    expect(west("tropics")).toBeCloseTo(-540 + 360 + 100 * CLOUD_BANDS.tropics.drift, 6);
  });

  it("keep within one turn however long they run, and drift slowly against the globe's own 3°/s", () => {
    for (const band of ["north", "tropics", "south"] as const) {
      for (const t of [0, 1, 59.5, 3600, 86_400 * 7]) {
        const s = bandShift(band, t);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(360);
      }
      expect(Math.abs(CLOUD_BANDS[band].drift)).toBeLessThan(0.2);
    }
  });

  it("the two moments share the sky: their opacities sum to one, from `a` alone to `b` alone and back", () => {
    expect(morph(0)).toBeCloseTo(0, 9);
    expect(morph(CLOUD_MORPH_S / 2)).toBeCloseTo(1, 9);
    expect(morph(CLOUD_MORPH_S)).toBeCloseTo(0, 9);
    for (const t of [0, 13, 75, 140]) {
      const layers = cloudLayers(t);
      for (const band of ["north", "tropics", "south"] as const) {
        const [a, b] = (["a", "b"] as const).map((slice) => layers.find((c) => c.slice === slice && c.band === band)!);
        expect(a.opacity + b.opacity).toBeCloseTo(1, 9);
        expect(a.coordinates).toEqual(b.coordinates);
      }
    }
  });

  it("are six pictures, `a` under `b`, each band once", () => {
    expect(CLOUD_LAYER_IDS).toEqual([
      "clouds-a-north",
      "clouds-a-tropics",
      "clouds-a-south",
      "clouds-b-north",
      "clouds-b-tropics",
      "clouds-b-south",
    ]);
  });

  it("the bands overlap, so where they part the clouds blur rather than tear", () => {
    expect(CLOUD_BANDS.north.south).toBeLessThan(CLOUD_BANDS.tropics.north);
    expect(CLOUD_BANDS.south.north).toBeGreaterThan(CLOUD_BANDS.tropics.south);
  });
});
