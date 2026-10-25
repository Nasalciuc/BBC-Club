/** ADR-IMPL-068: a tap anywhere on the globe — where it lands and whose it is (whether it is a tap at all: the
 *  engine's gestures, globe-engine.test.ts). */
import { describe, expect, it } from "bun:test";
import { geoDistance, geoOrthographic } from "d3-geo";

import {
  HORIZON_MARGIN_DEG,
  NEAR_SIDE_DEG,
  REST_ZOOM,
  ZOOM_RANGE,
  cameraDistance,
  cameraPoint,
  horizonDeg,
  limbRadius,
  mapPoint,
  mapTap,
  onGlobeDisc,
  radiusAtZoom,
  tapNearSideDeg,
  type GlobeCamera,
} from "./globe-geo";
import {
  GLOBE_SPEC,
  OPENING_VIEW,
  PRESS_GUARD_MS,
  createPressGuard,
  projector,
  radiusFor,
  type LonLat,
} from "./globe-logic";
import { drawnGlobeTap, mapboxPress, type TapChoice } from "./globe-tap";
import { labelBox, pinAt, pinTarget, pinUnion, type PlacedPin } from "./pin-labels";

const SIZE = GLOBE_SPEC.frame;
const C = SIZE / 2;
const RAD = Math.PI / 180;
const near = (a: LonLat, b: LonLat) => geoDistance([a[0], a[1]], [b[0], b[1]]) / RAD;

describe("the drawn globe's inverse: the place under a finger, or nothing off the disc", () => {
  it("round-trips point() at rest, at 3× and turned", () => {
    const places: LonLat[] = [
      [-0.46, 51.47], // London
      [55.36, 25.25], // Dubai
      [139.78, 35.55], // Tokyo
      [2.55, 49.01], // Paris
    ];
    const views = [
      { rotation: OPENING_VIEW.rotation, zoom: 1 },
      { rotation: OPENING_VIEW.rotation, zoom: 3 },
      { rotation: [-100, -20] as const, zoom: 1.7 },
    ];
    for (const v of views) {
      const proj = projector(SIZE, v.rotation, v.zoom);
      for (const p of places) {
        const xy = proj.point(p);
        if (!xy) continue; // the far side: not on screen, never tapped
        const back = proj.invert(xy[0], xy[1]);
        expect(back).not.toBeNull();
        expect(near(back!, p)).toBeLessThan(1e-4);
      }
    }
  });

  it("the centre of the view is the opening's centre, near Dubai", () => {
    const at = projector(SIZE, OPENING_VIEW.rotation, 1).invert(C, C)!;
    expect(at[0]).toBeCloseTo(55, 6);
    expect(at[1]).toBeCloseTo(27, 6);
  });

  it("a tap on the sky is null — d3 alone would clamp it to the limb, a real place", () => {
    const r = radiusFor(SIZE, 1);
    expect(r).toBe(GLOBE_SPEC.radius);
    const proj = projector(SIZE, OPENING_VIEW.rotation, 1);
    // 200 pt right of the centre, 32 pt beyond the disc.
    expect(proj.invert(C + 200, C)).toBeNull();
    const d3 = geoOrthographic()
      .scale(r)
      .translate([C, C])
      .rotate([...OPENING_VIEW.rotation])
      .clipAngle(90);
    const clamped = d3.invert!([C + 200, C])!;
    expect(Number.isFinite(clamped[0])).toBe(true);
    expect(clamped[0]).toBeCloseTo(145, 6);
    // Just inside the limb is the globe; just outside, nothing — at every zoom.
    for (const zoom of [1, 2, 3]) {
      const z = projector(SIZE, OPENING_VIEW.rotation, zoom);
      const rz = radiusFor(SIZE, zoom);
      expect(z.invert(C, C - rz + 0.5)).not.toBeNull();
      expect(z.invert(C, C - rz - 0.5)).toBeNull();
      expect(z.invert(C - rz * 0.8, C + rz * 0.8)).toBeNull(); // the corner beyond the disc
    }
  });
});

/** A map view 852 pt tall (a 6.1-inch phone's screen; made up for the tests). */
const VIEW_H = 852;

describe("Mapbox's disc", () => {
  it("a press is on the globe within the limb Mapbox's camera draws at the zoom, around its centre on screen", () => {
    const centre = { x: 196.5, y: 300 };
    const zoom = REST_ZOOM;
    const limb = limbRadius(zoom, VIEW_H);
    expect(onGlobeDisc(centre, zoom, centre, VIEW_H)).toBe(true);
    expect(onGlobeDisc({ x: centre.x + limb - 1, y: centre.y }, zoom, centre, VIEW_H)).toBe(true);
    expect(onGlobeDisc({ x: centre.x + limb + 1, y: centre.y }, zoom, centre, VIEW_H)).toBe(false);
    expect(onGlobeDisc({ x: centre.x, y: centre.y - limb - 30 }, zoom, centre, VIEW_H)).toBe(false); // the sky over it
    // The ring between radiusAtZoom and the limb is the globe's: Mapbox draws it there.
    expect(onGlobeDisc({ x: centre.x + radiusAtZoom(zoom) + 20, y: centre.y }, zoom, centre, VIEW_H)).toBe(true);
    // Zoomed in, the same press is on it.
    expect(onGlobeDisc({ x: centre.x + limb + 1, y: centre.y }, zoom + 1, centre, VIEW_H)).toBe(true);
    // Without the view's height there is no disc.
    expect(onGlobeDisc(centre, zoom, centre, Number.NaN)).toBe(false);
  });
});

describe("a press on Mapbox's map", () => {
  const centre = { x: 196.5, y: 266 };
  const cam: GlobeCamera = { center: [0, 0], zoom: REST_ZOOM };
  const r = radiusAtZoom(REST_ZOOM);
  /** As Android reports a press (@rnmapbox/maps 10.3.7): its screen point is the place reprojected, not the finger. */
  const android = (lng: number, lat: number) => ({ lng, lat, screen: mapPoint({ lng, lat }, cam, centre)! });

  it("a place on the near side, under the finger, is a tap there", () => {
    const at = mapTap(android(30, 10), cam, centre, VIEW_H);
    expect(at).not.toBeNull();
    expect(at!.x).toBeCloseTo(android(30, 10).screen.x, 6);
    expect(mapTap({ lng: 0, lat: 0, screen: centre }, cam, centre, VIEW_H)).toEqual(centre);
  });

  it("the sky on Android — the horizon's place, its screen point on the limb — is no tap", () => {
    // A press beside the globe: Mapbox answers with the nearest place on its horizon, short of 90° from the camera's
    // centre, and Android reprojects it onto the limb, where the disc alone would take it.
    const horizon = { lng: 90, lat: 0, screen: { x: centre.x + r, y: centre.y } };
    expect(onGlobeDisc(horizon.screen, cam.zoom, centre, VIEW_H)).toBe(true);
    expect(mapTap(horizon, cam, centre, VIEW_H)).toBeNull();
    // Past the near side at this zoom — 2° inside the horizon — is the sky too; just inside it, the globe.
    const near = tapNearSideDeg(cam.zoom, VIEW_H);
    expect(mapTap(android(near + 0.5, 0), cam, centre, VIEW_H)).toBeNull();
    expect(mapTap(android(0, -(near + 0.5)), cam, centre, VIEW_H)).toBeNull();
    expect(mapTap(android(near - 0.5, 0), cam, centre, VIEW_H)).not.toBeNull();
  });

  it("the sky on iOS — the finger itself off the disc — is no tap, whatever place Mapbox gives", () => {
    const limb = limbRadius(cam.zoom, VIEW_H);
    expect(
      mapTap({ lng: 30, lat: 10, screen: { x: centre.x + limb + 30, y: centre.y } }, cam, centre, VIEW_H),
    ).toBeNull();
    // The same place under a finger on the globe's outer ring, past radiusAtZoom, is a tap.
    expect(
      mapTap({ lng: 30, lat: 10, screen: { x: centre.x + r + 20, y: centre.y } }, cam, centre, VIEW_H),
    ).not.toBeNull();
  });

  it("a place that is no number is nothing; so is any place without the view's height", () => {
    expect(mapTap({ lng: Number.NaN, lat: 0, screen: centre }, cam, centre, VIEW_H)).toBeNull();
    expect(mapTap({ lng: 0, lat: 0, screen: centre }, cam, centre, Number.NaN)).toBeNull();
  });
});

/**
 * Mapbox's camera, drawn as mapbox-gl-js draws its globe (pitch 0, no bearing): the camera `d` above the globe's surface
 * at the view's centre, along the axis through the globe's centre, with the focal length `f` of its 0.6435-rad field of
 * view (1.5 view heights); a place is drawn where its ray from the camera crosses the screen (Android's
 * `pixelForCoordinate`); a press resolves to the first place its ray meets — or, when the ray passes beside the globe, to
 * the place on the horizon in the press's direction (gl-js `globePointCoordinate`). `d` is f × `scale`: gl-js's camera
 * (`nearer`) is cos 45° (the globe at Mercator's 45° scale), `farther` the camera at f itself; a smaller scale is a
 * camera nearer than gl-js's.
 */
function mapboxCamera(cam: GlobeCamera, centre: { x: number; y: number }, scale: number, viewHeight: number = VIEW_H) {
  const R = radiusAtZoom(cam.zoom);
  const focal = 1.5 * viewHeight; // screen points per unit across, one unit away
  const d = focal * scale;
  const sphere = geoOrthographic().scale(1).translate([0, 0]).rotate([-cam.center[0], -cam.center[1]]);
  const horizon = Math.acos(R / (R + d));
  const place = (ux: number, uy: number) => {
    const [lng, lat] = sphere.invert!([ux, uy])!;
    return { lng, lat };
  };
  return {
    horizonDeg: horizon / RAD,
    /** The globe's limb on screen: its distance from the globe's centre. */
    limb: (R * focal) / Math.sqrt(d * d + 2 * d * R),
    project(p: { lng: number; lat: number }) {
      const u = sphere([p.lng, p.lat]);
      if (!u) return null;
      const depth = d + R - R * Math.sqrt(Math.max(0, 1 - u[0] ** 2 - u[1] ** 2));
      return { x: centre.x + (focal * R * u[0]) / depth, y: centre.y + (focal * R * u[1]) / depth };
    },
    resolve(x: number, y: number) {
      const a = (x - centre.x) / focal;
      const b = (y - centre.y) / focal;
      const L = d + R;
      const A = a * a + b * b + 1;
      const disc = L * L - A * (L * L - R * R);
      if (disc >= 0) {
        const t = (L - Math.sqrt(disc)) / A;
        return place((t * a) / R, (t * b) / R);
      }
      const phi = Math.atan2(b, a);
      return place(Math.sin(horizon) * Math.cos(phi), Math.sin(horizon) * Math.sin(phi));
    },
  };
}
const CAMERAS = [
  ["nearer", Math.SQRT1_2],
  ["farther", 1],
] as const;

describe("Mapbox's horizon comes nearer as the globe zooms in: the sky beside it is no tap at any zoom", () => {
  const centre = { x: 196.5, y: 300 };
  const ZOOMS = [
    ["at rest", REST_ZOOM],
    ["at 2×", REST_ZOOM + 1],
    ["at 3×", ZOOM_RANGE.max],
  ] as const;
  const camAt = (zoom: number): GlobeCamera => ({ center: [12, 38], zoom }); // a made-up view
  const AZIMUTHS = [0, 35, 90, 140, 180, 225, 270, 320];
  const around = (radius: number, deg: number) => ({
    x: centre.x + radius * Math.cos(deg * RAD),
    y: centre.y + radius * Math.sin(deg * RAD),
  });
  const fromCentre = (p: { lng: number; lat: number }, cam: GlobeCamera) => near([p.lng, p.lat], cam.center);

  it("the camera stands 1.5 view heights × cos 45° above the globe; the horizon at 81°, 74°, 69°", () => {
    expect(cameraDistance(VIEW_H)).toBeCloseTo(1.5 * VIEW_H * Math.SQRT1_2, 6);
    expect(horizonDeg(REST_ZOOM, VIEW_H)).toBeCloseTo(80.98, 1);
    expect(horizonDeg(REST_ZOOM + 1, VIEW_H)).toBeCloseTo(74.27, 1);
    expect(horizonDeg(ZOOM_RANGE.max, VIEW_H)).toBeCloseTo(69.02, 1);
    // A taller view puts the camera farther: it sees more.
    expect(horizonDeg(REST_ZOOM, 932)).toBeGreaterThan(horizonDeg(REST_ZOOM, VIEW_H));
    // The near side a press may land on: 2° inside the horizon, never past the pins' 80°.
    expect(HORIZON_MARGIN_DEG).toBe(2);
    for (const [, zoom] of ZOOMS) {
      expect(tapNearSideDeg(zoom, VIEW_H)).toBeCloseTo(horizonDeg(zoom, VIEW_H) - 2, 9);
      expect(tapNearSideDeg(zoom, VIEW_H)).toBeLessThanOrEqual(NEAR_SIDE_DEG);
    }
    expect(tapNearSideDeg(REST_ZOOM, 4000)).toBe(NEAR_SIDE_DEG); // a camera far enough to see past 82°
  });

  it("the disc is the limb that camera draws: 203, 360 and 490 pt out — past radiusAtZoom at rest and 2×", () => {
    expect(limbRadius(REST_ZOOM, VIEW_H)).toBeCloseTo(202.85, 1);
    expect(limbRadius(REST_ZOOM + 1, VIEW_H)).toBeCloseTo(359.86, 1);
    expect(limbRadius(ZOOM_RANGE.max, VIEW_H)).toBeCloseTo(490.06, 1);
    for (const [, zoom] of ZOOMS) {
      expect(limbRadius(zoom, VIEW_H)).toBeCloseTo(mapboxCamera(camAt(zoom), centre, Math.SQRT1_2).limb, 9);
    }
    expect(limbRadius(REST_ZOOM, VIEW_H)).toBeGreaterThan(radiusAtZoom(REST_ZOOM));
    expect(limbRadius(REST_ZOOM + 1, VIEW_H)).toBeGreaterThan(radiusAtZoom(REST_ZOOM + 1));
  });

  it("a place stands where that camera draws it: 60° from the centre at rest, 188 pt out — not mapPoint's 146", () => {
    const ahead: GlobeCamera = { center: [0, 0], zoom: REST_ZOOM };
    const at = mapPoint({ lng: 60, lat: 0 }, ahead, centre)!;
    expect(at.x - centre.x).toBeCloseTo(145.49, 1);
    expect(cameraPoint(at, REST_ZOOM, centre, VIEW_H).x - centre.x).toBeCloseTo(188.26, 1);
    // Near the view's centre the camera draws the globe 1 / cos 45° larger; its centre stays put.
    const centred = cameraPoint({ x: centre.x + 1, y: centre.y }, REST_ZOOM, centre, VIEW_H);
    expect(centred.x - centre.x).toBeCloseTo(Math.SQRT2, 4);
    expect(cameraPoint(centre, REST_ZOOM, centre, VIEW_H)).toEqual(centre);
    for (const [, zoom] of ZOOMS) {
      const cam = camAt(zoom);
      const mapbox = mapboxCamera(cam, centre, Math.SQRT1_2);
      for (const p of [
        { lng: 12, lat: 38 },
        { lng: 40, lat: 52 },
        { lng: -31, lat: 9 },
        { lng: 75, lat: 20 },
        { lng: 20, lat: -25 },
      ]) {
        const there = cameraPoint(mapPoint(p, cam, centre)!, zoom, centre, VIEW_H);
        const want = mapbox.project(p)!;
        expect({ zoom, p, x: there.x, y: there.y }).toEqual({
          zoom,
          p,
          x: expect.closeTo(want.x, 6),
          y: expect.closeTo(want.y, 6),
        });
      }
    }
  });

  for (const [name, zoom] of ZOOMS) {
    for (const [kind, scale] of CAMERAS) {
      it(`${name}, ${kind} camera: a press on the sky beside the limb is no tap, on iOS and on Android`, () => {
        const cam = camAt(zoom);
        const mapbox = mapboxCamera(cam, centre, scale);
        for (const deg of AZIMUTHS) {
          for (const gap of [1, 4, 12, 40]) {
            const finger = around(mapbox.limb + gap, deg);
            const place = mapbox.resolve(finger.x, finger.y);
            // Mapbox gives the horizon's place.
            expect(fromCentre(place, cam)).toBeCloseTo(mapbox.horizonDeg, 6);
            if (zoom > REST_ZOOM) expect(fromCentre(place, cam)).toBeLessThan(NEAR_SIDE_DEG); // the fixed limit took it
            const ios = { ...place, screen: finger };
            const android = { ...place, screen: mapbox.project(place)! };
            expect(Math.hypot(android.screen.x - centre.x, android.screen.y - centre.y)).toBeCloseTo(mapbox.limb, 3);
            expect({ deg, gap, ios: mapTap(ios, cam, centre, VIEW_H) }).toEqual({ deg, gap, ios: null });
            expect({ deg, gap, android: mapTap(android, cam, centre, VIEW_H) }).toEqual({ deg, gap, android: null });
          }
        }
      });

      // gl-js's camera loses the last 2° of the globe to the margin: under half a point. The farther camera, whose
      // horizon stands past gl-js's, loses more of its rim — under 3 pt at 3×: 4 pt in is a tap for both.
      const insets = kind === "nearer" ? [1, 4, 12] : [4, 12];
      it(`${name}, ${kind} camera: a real press ${insets.join(", ")} pt inside the limb is a tap there, on iOS and on Android`, () => {
        const cam = camAt(zoom);
        const mapbox = mapboxCamera(cam, centre, scale);
        for (const deg of AZIMUTHS) {
          for (const inset of insets) {
            const finger = around(mapbox.limb - inset, deg);
            const place = mapbox.resolve(finger.x, finger.y);
            const back = mapbox.project(place)!;
            expect(back.x).toBeCloseTo(finger.x, 6); // the place under the finger
            expect(back.y).toBeCloseTo(finger.y, 6);
            // gl-js's camera at rest and 2×: the finger stands past radiusAtZoom, on the ring that disc took for the sky.
            if (kind === "nearer" && zoom < ZOOM_RANGE.max && inset < 12) {
              expect(Math.hypot(finger.x - centre.x, finger.y - centre.y)).toBeGreaterThan(radiusAtZoom(zoom));
            }
            for (const screen of [finger, back]) {
              const at = mapTap({ ...place, screen }, cam, centre, VIEW_H);
              expect({ deg, inset, at }).toEqual({ deg, inset, at: mapPoint(place, cam, centre) });
              expect(at).not.toBeNull();
            }
          }
        }
      });
    }
  }

  /**
   * gl-js eases the globe's scale from 45° to the centre's latitude from zoom 3 + log2(size / 1024), the size the view's
   * longer side (gl-js `getProjectionInterpolationT`, `Globe.pixelSpaceConversion`): its camera then stands nearer than
   * `cameraDistance` says — on a view `viewHeight` tall at 3× centred at `lat` — by this scale of the focal length.
   */
  const glScaleAt3x = (viewHeight: number, lat: number) => {
    const from = 3 + Math.log2(viewHeight / 1024);
    const x = Math.min(1, Math.max(0, (ZOOM_RANGE.max - from) / 2));
    const t = x * x * (3 - 2 * x);
    return 1 / ((1 - t) / Math.SQRT1_2 + t / Math.cos(lat * RAD));
  };
  const at3x = (lat: number): GlobeCamera => ({ center: [12, lat], zoom: ZOOM_RANGE.max });

  it("a camera nearer than gl-js's: its horizon may pass the near side, and the disc stops its sky", () => {
    // On a 640-pt view the ease starts at 2.32, so at 3× (2.63) centred at 80°N the horizon comes 2.8° nearer; on a
    // 667-pt view it starts at 2.38, and centred at 85°N (about as far as the centre goes) the horizon comes 4.2° nearer.
    // Not modelled: the disc is the backstop, as it is for a native camera nearer than gl-js's (here 30 % nearer, at rest
    // on the 852-pt view).
    expect(glScaleAt3x(640, 80)).toBeLessThan(Math.SQRT1_2);
    const cases = [
      { cam: at3x(80), scale: glScaleAt3x(640, 80), viewHeight: 640 },
      { cam: at3x(85), scale: glScaleAt3x(667, 85), viewHeight: 667 },
      { cam: camAt(REST_ZOOM), scale: Math.SQRT1_2 * 0.7, viewHeight: VIEW_H },
    ];
    expect(
      horizonDeg(ZOOM_RANGE.max, 640) - mapboxCamera(at3x(80), centre, cases[0]!.scale, 640).horizonDeg,
    ).toBeCloseTo(2.82, 1);
    expect(
      horizonDeg(ZOOM_RANGE.max, 667) - mapboxCamera(at3x(85), centre, cases[1]!.scale, 667).horizonDeg,
    ).toBeCloseTo(4.15, 1);
    for (const { cam, scale, viewHeight } of cases) {
      const mapbox = mapboxCamera(cam, centre, scale, viewHeight);
      expect(mapbox.limb).toBeGreaterThan(limbRadius(cam.zoom, viewHeight));
      for (const deg of AZIMUTHS) {
        for (const gap of [1, 4, 12, 40]) {
          const finger = around(mapbox.limb + gap, deg);
          const place = mapbox.resolve(finger.x, finger.y);
          // The sky's place passes the near side: the place alone would take it for the globe.
          expect(fromCentre(place, cam)).toBeLessThan(tapNearSideDeg(cam.zoom, viewHeight));
          const ios = { ...place, screen: finger };
          const android = { ...place, screen: mapbox.project(place)! };
          expect({ deg, gap, ios: mapTap(ios, cam, centre, viewHeight) }).toEqual({ deg, gap, ios: null });
          expect({ deg, gap, android: mapTap(android, cam, centre, viewHeight) }).toEqual({ deg, gap, android: null });
        }
      }
    }
  });

  it("on a 667-pt view at 3×, up to about 80°N the margin covers gl-js's nearer camera: its sky's place stays past the near side", () => {
    const cam = at3x(80);
    const mapbox = mapboxCamera(cam, centre, glScaleAt3x(667, 80), 667);
    expect(horizonDeg(cam.zoom, 667) - mapbox.horizonDeg).toBeCloseTo(1.89, 1);
    expect(horizonDeg(cam.zoom, 667) - mapbox.horizonDeg).toBeLessThan(HORIZON_MARGIN_DEG);
    for (const deg of AZIMUTHS) {
      for (const gap of [1, 4, 12, 40]) {
        const finger = around(mapbox.limb + gap, deg);
        const place = mapbox.resolve(finger.x, finger.y);
        expect(fromCentre(place, cam)).toBeGreaterThan(tapNearSideDeg(cam.zoom, 667));
        // The place alone stops it, wherever the screen point is.
        expect(mapTap({ ...place, screen: centre }, cam, centre, 667)).toBeNull();
      }
    }
  });
});

describe("whose a touch on the globe is (globe-tap.ts)", () => {
  const never = { pressedLately: () => false };
  const lately = { pressedLately: () => true };
  const placeOf = (c: TapChoice | null) => (c?.kind === "place" ? c.tap : null);

  describe("the drawn globe", () => {
    const view = { rotation: OPENING_VIEW.rotation, zoom: 1 };
    const proj = projector(SIZE, view.rotation, view.zoom);
    const [lx, ly] = proj.point([-0.46, 51.47])!; // London
    const placed: PlacedPin[] = [{ code: "LHR", x: lx, y: ly, lines: [], label: null }];
    const seen = (over: { placed?: PlacedPin[]; route?: boolean } = {}) => ({
      size: SIZE,
      view,
      placed,
      route: false,
      ...over,
    });

    it("pins keep priority: the pin and its 44-pt target are the pin's, a press guard or not", () => {
      expect(drawnGlobeTap({ x: lx, y: ly - 10 }, seen(), never)).toEqual({ kind: "pin", code: "LHR" });
      const t = pinTarget(lx, ly, null);
      expect(drawnGlobeTap({ x: t.right - 0.5, y: t.top + 0.5 }, seen(), never)).toEqual({ kind: "pin", code: "LHR" });
      // The pin's own press answered first: still the pin's — the screen's guard keeps the touch to one choice.
      expect(drawnGlobeTap({ x: lx, y: ly - 10 }, seen(), lately)).toEqual({ kind: "pin", code: "LHR" });
      // Without the pin, the same finger is on London itself.
      const bare = placeOf(drawnGlobeTap({ x: lx, y: ly }, seen({ placed: [] }), never));
      expect(near([bare!.lng, bare!.lat], [-0.46, 51.47])).toBeLessThan(1e-4);
    });

    it("elsewhere on the disc, the place under the finger, measured in the view the finger saw", () => {
      const tap = placeOf(drawnGlobeTap({ x: C, y: C }, seen(), never))!;
      expect(tap.lng).toBeCloseTo(55, 6);
      expect(tap.lat).toBeCloseTo(27, 6);
      expect([tap.x, tap.y]).toEqual([C, C]);
      const london = tap.project({ lng: -0.46, lat: 51.47 })!;
      expect(london.x).toBeCloseTo(lx, 6);
      expect(london.y).toBeCloseTo(ly, 6);
      expect(tap.project({ lng: -120, lat: 40 })).toBeNull(); // the far side: out of sight
    });

    it("the sky, a chosen route's view and a touch a pin's press answered are nothing", () => {
      expect(drawnGlobeTap({ x: C + 200, y: C }, seen(), never)).toBeNull();
      expect(drawnGlobeTap({ x: C, y: C }, seen({ route: true }), never)).toBeNull();
      expect(drawnGlobeTap({ x: lx, y: ly - 10 }, seen({ route: true }), never)).toBeNull();
      expect(drawnGlobeTap({ x: C, y: C }, seen(), lately)).toBeNull();
    });
  });

  describe("Mapbox's press", () => {
    const centre = { x: 196.5, y: 266 };
    const cam: GlobeCamera = { center: [0, 0], zoom: REST_ZOOM };
    const r = radiusAtZoom(REST_ZOOM);
    /** Mapbox as gl-js's camera draws it (`mapboxCamera`): where it shows a pin, and the place under a finger. */
    const mapbox = mapboxCamera(cam, centre, Math.SQRT1_2);
    /** As iOS reports a press: the finger itself, and the place Mapbox resolved under it. */
    const ios = (x: number, y: number) => ({ ...mapbox.resolve(x, y), screen: { x, y } });
    const PARIS = { lng: 2.55, lat: 49.01 };
    // MapboxGlobe places its pins with `mapPoint` (which labels fit, on which side); Mapbox draws Paris's MarkerView
    // where its camera shows Paris — 41 pt farther out, 49° from the view's centre at rest.
    const paris = mapPoint(PARIS, cam, centre)!;
    const shown = mapbox.project(PARIS)!;
    const placed: PlacedPin[] = [{ code: "CDG", x: paris.x, y: paris.y, lines: [], label: null }];
    const seen = (over: { placed?: PlacedPin[]; route?: boolean } = {}) => ({
      camera: cam,
      centre,
      viewHeight: VIEW_H,
      placed,
      route: false,
      ...over,
    });

    it("a press in a pin's 44-pt target, outside its MarkerView, opens the pin: the map is the only one to get it", () => {
      // The MarkerView is the pin's own frame (pinFrame: the pin and its label, `pinUnion`), where Mapbox shows it;
      // @rnmapbox/maps 10.3.7 hands a press outside it to the map — the pin's hit slop never sees it.
      expect(Math.hypot(shown.x - paris.x, shown.y - paris.y)).toBeGreaterThan(40);
      const frame = pinUnion(shown.x, shown.y, null);
      const target = pinTarget(shown.x, shown.y, null);
      const ring = { x: frame.right + 6, y: (frame.top + frame.bottom) / 2 };
      expect(ring.x).toBeGreaterThan(frame.right);
      expect(ring.x).toBeLessThan(target.right);
      expect(mapboxPress(ios(ring.x, ring.y), seen(), never)).toEqual({ kind: "pin", code: "CDG" });
      expect(mapboxPress(ios(shown.x - 9 - 12, shown.y + 8), seen(), never)).toEqual({ kind: "pin", code: "CDG" });
      // The pin's own press answered first (Android may send both): still the pin's — the guard chooses once.
      expect(mapboxPress(ios(ring.x, ring.y), seen(), lately)).toEqual({ kind: "pin", code: "CDG" });
      // Past the target, the place.
      expect(mapboxPress(ios(target.right + 2, ring.y), seen(), never)?.kind).toBe("place");
      // Where `mapPoint` puts Paris, 41 pt inside the pin Mapbox shows, is the globe's: no pin is there.
      expect(mapboxPress(ios(paris.x, paris.y), seen(), never)?.kind).toBe("place");
    });

    it("a pin on the globe's outer ring keeps its 44-pt target where Mapbox shows it, at rest and 2×", () => {
      // 60° from the view's centre: shown 188 pt out at rest (`mapPoint`: 146), 347 at 2× (291) — at rest on the ring a
      // disc of radiusAtZoom took for the sky, where a press beside the pin would now snap to another city.
      const FAR = { lng: 60, lat: 0 };
      const lines = ["Somewhere", "$1,234"]; // made up
      for (const zoom of [REST_ZOOM, REST_ZOOM + 1]) {
        const camera: GlobeCamera = { ...cam, zoom };
        const mb = mapboxCamera(camera, centre, Math.SQRT1_2);
        const press = (x: number, y: number) => ({ ...mb.resolve(x, y), screen: { x, y } });
        const at = mapPoint(FAR, camera, centre)!;
        const pin = mb.project(FAR)!;
        expect(pin.x - at.x).toBeGreaterThan(40);
        if (zoom === REST_ZOOM) expect(pin.x - centre.x).toBeGreaterThan(radiusAtZoom(zoom));
        const view = (p: PlacedPin[]) => ({ ...seen({ placed: p }), camera });
        // A pin alone: a press 6 pt beside its MarkerView, on each side, is the pin's.
        const bare = view([{ code: "XXX", x: at.x, y: at.y, lines: [], label: null }]);
        const frame = pinUnion(pin.x, pin.y, null);
        const midY = (frame.top + frame.bottom) / 2;
        for (const finger of [
          { x: frame.right + 6, y: midY },
          { x: frame.left - 6, y: midY },
          { x: pin.x, y: frame.bottom + 6 },
        ]) {
          expect({ zoom, finger, choice: mapboxPress(press(finger.x, finger.y), bare, never) }).toEqual({
            zoom,
            finger,
            choice: { kind: "pin", code: "XXX" },
          });
        }
        expect(mapboxPress(press(at.x, at.y), bare, never)?.kind).toBe("place");
        // With its label: the pin and the label are one MarkerView, shown together — the ring over the label is the pin's.
        const box = labelBox(at.x, at.y, lines, "right");
        const labelled = view([{ code: "XXX", x: at.x, y: at.y, lines, label: { side: "right", box } }]);
        const shownBox = {
          left: box.left + pin.x - at.x,
          right: box.right + pin.x - at.x,
          top: box.top + pin.y - at.y,
          bottom: box.bottom + pin.y - at.y,
        };
        const whole = pinUnion(pin.x, pin.y, shownBox);
        const target = pinTarget(pin.x, pin.y, shownBox);
        expect(target.top).toBeLessThan(whole.top - 1);
        const over = { x: (shownBox.left + shownBox.right) / 2, y: whole.top - 1 };
        expect(mapboxPress(press(over.x, over.y), labelled, never)).toEqual({ kind: "pin", code: "XXX" });
      }
    });

    it("elsewhere on the disc, the place Mapbox gives, where it stands on screen", () => {
      const finger = { x: centre.x + 40, y: centre.y - 30 };
      const tap = placeOf(mapboxPress(ios(finger.x, finger.y), seen(), never))!;
      expect(tap.x).toBeCloseTo(finger.x, 6);
      expect(tap.y).toBeCloseTo(finger.y, 6);
      // The city where Mapbox shows it, as the finger: how far apart they stand is measured as they are drawn.
      const p = tap.project(PARIS)!;
      expect(p.x).toBeCloseTo(shown.x, 6);
      expect(p.y).toBeCloseTo(shown.y, 6);
      expect(tap.project({ lng: 120, lat: 0 })).toBeNull(); // past the near side: out of sight
    });

    it("the sky, a chosen route and a touch a pin's press answered are nothing", () => {
      expect(mapboxPress({ lng: 90, lat: 0, screen: { x: centre.x + r, y: centre.y } }, seen(), never)).toBeNull();
      const limb = limbRadius(cam.zoom, VIEW_H);
      expect(
        mapboxPress({ lng: 30, lat: 10, screen: { x: centre.x + limb + 30, y: centre.y } }, seen(), never),
      ).toBeNull();
      expect(mapboxPress(ios(centre.x, centre.y), seen({ route: true }), never)).toBeNull();
      expect(mapboxPress(ios(shown.x, shown.y - 10), seen({ route: true }), never)).toBeNull();
      expect(mapboxPress(ios(centre.x, centre.y), seen(), lately)).toBeNull();
    });
  });
});

describe("a tap on a pin is the pin's", () => {
  const lines = ["London", "$1,234"]; // a made-up price
  const placed: PlacedPin[] = [
    { code: "LHR", x: 300, y: 300, lines, label: { side: "right", box: labelBox(300, 300, lines, "right") } },
    { code: "CDG", x: 500, y: 500, lines: [], label: null },
  ];

  it("its pin, its label and its 44-pt target; beside them, nothing", () => {
    expect(pinAt(300, 290, placed)).toBe("LHR"); // the pin's head
    const label = placed[0]!.label!.box;
    expect(pinAt(label.right - 2, (label.top + label.bottom) / 2, placed)).toBe("LHR"); // the label's end
    const target = pinTarget(500, 500, null);
    expect(target.right - target.left).toBe(GLOBE_SPEC.pin.hit);
    expect(target.bottom - target.top).toBe(GLOBE_SPEC.pin.hit);
    expect(pinAt(target.left + 0.5, target.top + 0.5, placed)).toBe("CDG"); // the slop around a pin alone
    expect(pinAt(target.left - 1, 500, placed)).toBeNull();
    expect(pinAt(400, 420, placed)).toBeNull();
  });

  it("where two targets overlap, the pin drawn last — on top — takes it", () => {
    const close: PlacedPin[] = [
      { code: "LHR", x: 300, y: 300, lines: [], label: null },
      { code: "LGW", x: 310, y: 305, lines: [], label: null },
    ];
    expect(pinAt(305, 295, close)).toBe("LGW");
    expect(pinAt(305, 295, [...close].reverse())).toBe("LHR");
  });
});

describe("one choice per touch", () => {
  it("a pin's press and the globe's tap on it choose once, in either order; a later press chooses again", () => {
    let now = 1_000;
    const guard = createPressGuard(() => now);
    expect(guard.choose("LHR")).toBe(true);
    now += 30;
    expect(guard.choose("LHR")).toBe(false); // the same touch, seen twice
    expect(guard.pressedLately()).toBe(true);
    now += PRESS_GUARD_MS;
    expect(guard.pressedLately()).toBe(false);
    expect(guard.choose("LHR")).toBe(true); // a new touch
    now += 10;
    expect(guard.choose("CDG")).toBe(true); // another pin is another choice
  });
});
