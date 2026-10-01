import { describe, expect, it } from "bun:test";
import {
  GLOBE_SPEC,
  approach,
  atOpening,
  detailFor,
  dragRotation,
  globeMode,
  haloOpacity,
  isOnNearSide,
  normalizeLambda,
  projector,
  rotationAt,
  routeArcPath,
  type GlobeInputs,
  type LonLat,
  type Point,
  type Rotation,
} from "./globe-logic";

const JFK: LonLat = [-73.78, 40.64],
  LHR: LonLat = [-0.45, 51.47],
  CDG: LonLat = [2.55, 49.01],
  DXB: LonLat = [55.36, 25.25],
  HND: LonLat = [139.78, 35.55];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function near(a: Point | null, b: Point, tol: number) {
  expect(a).not.toBeNull();
  if (a) expect(dist(a, b)).toBeLessThan(tol);
}
const base: GlobeInputs = {
  reducedMotion: false,
  appActive: true,
  interacting: false,
  selected: null,
  msSinceInteraction: null,
  atOpening: true,
};

describe("matches Figma 97:435 (Home · London selected)", () => {
  const p = projector(520, GLOBE_SPEC.opening);
  it("places the four pins where Figma draws them", () => {
    near(p.point(JFK), [129.8, 205.6], 0.5);
    near(p.point(LHR), [336.2, 178.2], 0.5);
    near(p.point(CDG), [347.5, 185.3], 0.5);
    near(p.point(DXB), [483.6, 183.8], 0.5);
  });
  it("draws the route arc within 1 px of Figma's reference path (Route arc · original reference)", () => {
    const a = p.point(JFK),
      b = p.point(LHR);
    if (!a || !b) throw new Error("JFK and LHR must be visible at the opening position");
    const nums = (routeArcPath(a, b, [260, 260]).match(/-?[\d.]+/g) ?? []).map(Number);
    expect(nums).toHaveLength(6);
    const [ax = 0, ay = 0, cx = 0, cy = 0, bx = 0, by = 0] = nums;
    const ours = (t: number): Point => [
      (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx,
      (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by,
    ];
    const F: readonly Point[] = [
      [129.8, 205.6],
      [188.6, 129.872],
      [257.397, 120.719],
      [336.19, 178.159],
    ]; // Figma's cubic
    const [f0 = [0, 0], f1 = [0, 0], f2 = [0, 0], f3 = [0, 0]] = F;
    const figma = (t: number): Point => [
      (1 - t) ** 3 * f0[0] + 3 * (1 - t) ** 2 * t * f1[0] + 3 * (1 - t) * t * t * f2[0] + t ** 3 * f3[0],
      (1 - t) ** 3 * f0[1] + 3 * (1 - t) ** 2 * t * f1[1] + 3 * (1 - t) * t * t * f2[1] + t ** 3 * f3[1],
    ];
    const ref = Array.from({ length: 401 }, (_, k) => figma(k / 400));
    let worst = 0;
    for (let k = 0; k <= 200; k++) {
      const q = ours(k / 200);
      worst = Math.max(worst, Math.min(...ref.map((r) => dist(q, r))));
    }
    expect(worst).toBeLessThan(1);
  });
  it("hides pins on the far hemisphere", () => {
    expect(p.point(HND)).toBeNull();
    expect(isOnNearSide(DXB, GLOBE_SPEC.opening)).toBe(true);
  });
});

describe("motion (Figma 06 · Motion)", () => {
  it("one turn in 120 s; the loop closes on the same longitude", () => {
    expect(rotationAt(0)).toBeCloseTo(30, 6);
    expect(rotationAt(120_000)).toBeCloseTo(30, 6);
    expect(rotationAt(60_000)).toBeCloseTo(-150, 6);
    expect(rotationAt(1_000)).toBeCloseTo(33, 6);
  });
  it("halos ease 0.07 → 0.14 → 0.07 over 2 s, and hold 0.14 when still", () => {
    expect(haloOpacity(0, false)).toBeCloseTo(0.07, 6);
    expect(haloOpacity(1_000, false)).toBeCloseTo(0.14, 6);
    expect(haloOpacity(2_000, false)).toBeCloseTo(0.07, 6);
    expect(haloOpacity(700, true)).toBe(0.14);
  });
});

describe("globeMode — priority", () => {
  it("background pauses everything", () =>
    expect(globeMode({ ...base, appActive: false, reducedMotion: true })).toBe("paused"));
  it("a finger on the globe pauses it", () =>
    expect(globeMode({ ...base, interacting: true, selected: "LHR" })).toBe("paused"));
  it("reduced motion is still", () =>
    expect(globeMode({ ...base, reducedMotion: true, selected: "LHR", atOpening: false })).toBe("still"));
  it("a selection returns to the opening position, then holds it", () => {
    expect(globeMode({ ...base, selected: "LHR", atOpening: false })).toBe("returning");
    expect(globeMode({ ...base, selected: "LHR", atOpening: true })).toBe("still");
  });
  it("waits 4 s after an interaction, then rotates", () => {
    expect(globeMode({ ...base, msSinceInteraction: 3_999 })).toBe("paused");
    expect(globeMode({ ...base, msSinceInteraction: 4_000 })).toBe("rotating");
    expect(globeMode(base)).toBe("rotating");
  });
});

describe("gestures and detail", () => {
  it("a drag of one radian-pixel turns one degree; tilt is clamped", () => {
    expect(dragRotation([30, -35], (248 * Math.PI) / 180, 0, 248)[0]).toBeCloseTo(31, 6);
    expect(dragRotation([30, -35], 0, -1e6, 248)[1]).toBe(GLOBE_SPEC.tilt.max);
  });
  it("returning takes the short way across the date line and lands exactly", () => {
    const first = approach({ rotation: [170, -35], zoom: 1 }, { rotation: [-170, -35], zoom: 1 }, 16);
    expect(normalizeLambda(first.rotation[0] - 170)).toBeGreaterThan(0);
    let s: { rotation: Rotation; zoom: number; done: boolean } = { rotation: [170, -35], zoom: 2, done: false };
    for (let i = 0; i < 400 && !s.done; i++) s = approach(s, { rotation: GLOBE_SPEC.opening, zoom: 1 }, 16);
    expect(s.done).toBe(true);
    expect(atOpening(s.rotation, s.zoom)).toBe(true);
  });
  it("detail: low under a finger, high when still or zoomed, mid while rotating", () => {
    expect(detailFor("paused", true, 1)).toBe("low");
    expect(detailFor("rotating", false, 1)).toBe("mid");
    expect(detailFor("still", false, 1)).toBe("high");
    expect(detailFor("rotating", false, 2)).toBe("high");
  });
});
