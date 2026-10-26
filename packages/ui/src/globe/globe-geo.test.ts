import { describe, expect, it } from "bun:test";

import { GLOBE_SPEC, projector, routeView } from "./globe-logic";
import {
  NEAR_SIDE_DEG,
  OPENING_CENTER,
  REST_ZOOM,
  ZOOM_RANGE,
  globePadding,
  mapPoint,
  radiusAtZoom,
  routeCamera,
  routeLine,
  routeMiddle,
} from "./globe-geo";

const JFK = { lat: 40.6413, lng: -73.7781 };
const LHR = { lat: 51.47, lng: -0.4543 };
const DXB = { lat: 25.2532, lng: 55.3657 };
const HND = { lat: 35.5494, lng: 139.7798 };

describe("REST_ZOOM", () => {
  it("draws Mapbox's globe the size of the drawn one at rest (02)", () => {
    expect(radiusAtZoom(REST_ZOOM)).toBeCloseTo(GLOBE_SPEC.radius, 6);
  });

  it("pinches to 3× and frames a long route down to three quarters", () => {
    expect(radiusAtZoom(ZOOM_RANGE.max)).toBeCloseTo(GLOBE_SPEC.radius * 3, 6);
    expect(radiusAtZoom(ZOOM_RANGE.min)).toBeCloseTo(GLOBE_SPEC.radius * 0.75, 6);
  });

  it("opens over Dubai's longitude", () => {
    expect(OPENING_CENTER).toEqual([55, 27]);
  });
});

describe("routeLine", () => {
  it("runs from home to the destination along a great circle", () => {
    const c = routeLine(JFK, LHR)?.geometry.coordinates ?? [];
    expect(c[0]?.[0]).toBeCloseTo(JFK.lng, 6);
    expect(c[0]?.[1]).toBeCloseTo(JFK.lat, 6);
    expect(c.at(-1)?.[0]).toBeCloseTo(LHR.lng, 6);
    expect(c.at(-1)?.[1]).toBeCloseTo(LHR.lat, 6);
  });

  it("never jumps across the map where it meets the antimeridian (New York → Tokyo)", () => {
    const c = routeLine(JFK, HND)?.geometry.coordinates ?? [];
    expect(c.length).toBe(65);
    for (let i = 1; i < c.length; i++) {
      expect(Math.abs((c[i]?.[0] ?? 0) - (c[i - 1]?.[0] ?? 0))).toBeLessThan(180);
    }
  });

  it("has no line for a zero-length route", () => {
    expect(routeLine(JFK, JFK)).toBeNull();
  });
});

describe("routeCamera", () => {
  it("is the drawn globe's framing, in Mapbox's terms", () => {
    for (const dest of [LHR, DXB, HND]) {
      const cam = routeCamera(JFK, dest);
      const view = routeView([JFK.lng, JFK.lat], [dest.lng, dest.lat]);
      expect(radiusAtZoom(cam.zoom)).toBeCloseTo(GLOBE_SPEC.radius * view.zoom, 6);
      expect(cam.zoom).toBeGreaterThanOrEqual(ZOOM_RANGE.min - 1e-9);
      expect(cam.zoom).toBeLessThanOrEqual(ZOOM_RANGE.max + 1e-9);
    }
  });

  it("centres the destination when there is no home", () => {
    const cam = routeCamera(null, LHR);
    expect(cam.center[0]).toBeCloseTo(LHR.lng, 6);
    expect(cam.center[1]).toBeCloseTo(LHR.lat, 6);
  });
});

describe("routeMiddle", () => {
  it("puts the plane halfway, heading east-north-east over the Atlantic", () => {
    const mid = routeMiddle(JFK, LHR);
    expect(mid).not.toBeNull();
    if (!mid) return;
    expect(mid.at[0]).toBeGreaterThan(-50);
    expect(mid.at[0]).toBeLessThan(-30);
    expect(mid.bearing).toBeGreaterThan(45);
    expect(mid.bearing).toBeLessThan(100);
  });

  it("has no middle for a zero-length route", () => {
    expect(routeMiddle(JFK, JFK)).toBeNull();
  });
});

describe("globePadding", () => {
  it("puts the globe's centre where the screen asks on a 768-point map view", () => {
    expect(globePadding(266, 768).paddingBottom).toBe(236);
    expect(globePadding(165, 768).paddingBottom).toBe(438);
  });

  it("pads above for a centre in the lower half, and never asks for negative padding", () => {
    expect(globePadding(500, 768)).toMatchObject({ paddingTop: 232, paddingBottom: 0 });
    expect(globePadding(266, 768).paddingTop).toBe(0);
    // Mapbox centres the camera in what the padding leaves.
    for (const [centreY, h] of [
      [266, 768],
      [500, 768],
      [415, 769],
    ] as const) {
      const p = globePadding(centreY, h);
      expect(p.paddingTop + (h - p.paddingTop - p.paddingBottom) / 2).toBeCloseTo(centreY, 0);
    }
  });
});

describe("mapPoint", () => {
  const camera = { center: [OPENING_CENTER[0], OPENING_CENTER[1]] as [number, number], zoom: REST_ZOOM };
  const centre = { x: 196.5, y: 266 };

  it("projects as the drawn globe does at rest", () => {
    const drawn = projector(GLOBE_SPEC.frame, GLOBE_SPEC.opening).point([LHR.lng, LHR.lat]);
    const onMap = mapPoint(LHR, camera, centre);
    expect(drawn).not.toBeNull();
    expect(onMap).not.toBeNull();
    if (!drawn || !onMap) return;
    expect(onMap.x - centre.x).toBeCloseTo(drawn[0] - GLOBE_SPEC.frame / 2, 1);
    expect(onMap.y - centre.y).toBeCloseTo(drawn[1] - GLOBE_SPEC.frame / 2, 1);
  });

  it("hides a place more than NEAR_SIDE_DEG from the view's centre", () => {
    expect(NEAR_SIDE_DEG).toBeLessThan(90);
    expect(mapPoint(JFK, camera, centre)).toBeNull();
  });
});
