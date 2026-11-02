import { describe, expect, it } from "bun:test";

import { CLOUD_BANDS, CLOUD_LAYER_IDS, CLOUD_MORPH_S, bandShift, cloudLayers, morph } from "./cloud-drift";

describe("the globe's clouds move as the winds would (ADR-IMPL-085)", () => {
  it("start where the generator drew them: every picture spans the whole turn from -180°", () => {
    for (const c of cloudLayers(0)) {
      const [[west, north], [east], [, south]] = c.coordinates;
      expect(west).toBe(-180);
      expect(east).toBe(180);
      expect(north).toBe(CLOUD_BANDS[c.band].north);
      expect(south).toBe(CLOUD_BANDS[c.band].south);
    }
  });

  it("drift east in the westerlies of both hemispheres and west in the trades", () => {
    expect(CLOUD_BANDS.north.drift).toBeGreaterThan(0);
    expect(CLOUD_BANDS.south.drift).toBeGreaterThan(0);
    expect(CLOUD_BANDS.tropics.drift).toBeLessThan(0);
    const later = cloudLayers(100);
    const west = (band: string) => later.find((c) => c.slice === "a" && c.band === band)!.coordinates[0][0];
    expect(west("north")).toBeCloseTo(-180 + 100 * CLOUD_BANDS.north.drift, 6);
    expect(west("tropics")).toBeCloseTo(-180 + 360 + 100 * CLOUD_BANDS.tropics.drift, 6);
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
