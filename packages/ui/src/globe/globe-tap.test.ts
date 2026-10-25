/** ADR-IMPL-068: a tap anywhere on the globe — where it lands and whose it is (whether it is a tap at all: the
 *  engine's gestures, globe-engine.test.ts). */
import { describe, expect, it } from "bun:test";
import { geoDistance, geoOrthographic } from "d3-geo";

import { NEAR_SIDE_DEG, REST_ZOOM, mapPoint, mapTap, onGlobeDisc, radiusAtZoom, type GlobeCamera } from "./globe-geo";
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

describe("Mapbox's disc", () => {
  it("a press is on the globe within its radius at the camera's zoom of its centre on screen", () => {
    const centre = { x: 196.5, y: 300 };
    const zoom = 1.04;
    const r = radiusAtZoom(zoom);
    expect(onGlobeDisc(centre, zoom, centre)).toBe(true);
    expect(onGlobeDisc({ x: centre.x + r - 1, y: centre.y }, zoom, centre)).toBe(true);
    expect(onGlobeDisc({ x: centre.x + r + 1, y: centre.y }, zoom, centre)).toBe(false);
    expect(onGlobeDisc({ x: centre.x, y: centre.y - r - 30 }, zoom, centre)).toBe(false); // the sky over the globe
    // Zoomed in, the same press is on it.
    expect(onGlobeDisc({ x: centre.x + r + 1, y: centre.y }, zoom + 1, centre)).toBe(true);
  });
});

describe("a press on Mapbox's map", () => {
  const centre = { x: 196.5, y: 266 };
  const cam: GlobeCamera = { center: [0, 0], zoom: REST_ZOOM };
  const r = radiusAtZoom(REST_ZOOM);
  /** As Android reports a press (@rnmapbox/maps 10.3.7): its screen point is the place reprojected, not the finger. */
  const android = (lng: number, lat: number) => ({ lng, lat, screen: mapPoint({ lng, lat }, cam, centre)! });

  it("a place on the near side, under the finger, is a tap there", () => {
    const at = mapTap(android(30, 10), cam, centre);
    expect(at).not.toBeNull();
    expect(at!.x).toBeCloseTo(android(30, 10).screen.x, 6);
    expect(mapTap({ lng: 0, lat: 0, screen: centre }, cam, centre)).toEqual(centre);
  });

  it("the sky on Android — the horizon's place, its screen point on the limb — is no tap", () => {
    // A press beside the globe: Mapbox answers with the nearest place on its horizon, 90° from the camera's centre, and
    // Android reprojects it onto the limb, where the disc alone would take it.
    const horizon = { lng: 90, lat: 0, screen: { x: centre.x + r, y: centre.y } };
    expect(onGlobeDisc(horizon.screen, cam.zoom, centre)).toBe(true);
    expect(mapTap(horizon, cam, centre)).toBeNull();
    // The camera's horizon may stand short of 90°: past the near side, where no pin is drawn, is the sky too.
    expect(mapTap(android(NEAR_SIDE_DEG + 2, 0), cam, centre)).toBeNull();
    expect(mapTap(android(0, -(NEAR_SIDE_DEG + 2)), cam, centre)).toBeNull();
    expect(mapTap(android(NEAR_SIDE_DEG - 2, 0), cam, centre)).not.toBeNull();
  });

  it("the sky on iOS — the finger itself off the disc — is no tap, whatever place Mapbox gives", () => {
    expect(mapTap({ lng: 30, lat: 10, screen: { x: centre.x + r + 30, y: centre.y } }, cam, centre)).toBeNull();
  });

  it("a place that is no number is nothing", () => {
    expect(mapTap({ lng: Number.NaN, lat: 0, screen: centre }, cam, centre)).toBeNull();
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
    /** As iOS reports a press: the finger itself, and the place Mapbox resolved under it. */
    const ios = (x: number, y: number) => {
      const [lng, lat] = geoOrthographic()
        .scale(r)
        .translate([centre.x, centre.y])
        .rotate([-cam.center[0], -cam.center[1]]).invert!([x, y])!;
      return { lng, lat, screen: { x, y } };
    };
    const paris = mapPoint({ lng: 2.55, lat: 49.01 }, cam, centre)!;
    const placed: PlacedPin[] = [{ code: "CDG", x: paris.x, y: paris.y, lines: [], label: null }];
    const seen = (over: { placed?: PlacedPin[]; route?: boolean } = {}) => ({
      camera: cam,
      centre,
      placed,
      route: false,
      ...over,
    });

    it("a press in a pin's 44-pt target, outside its MarkerView, opens the pin: the map is the only one to get it", () => {
      // The MarkerView is the pin's own frame (pinFrame: the pin and its label, `pinUnion`); @rnmapbox/maps 10.3.7 hands
      // a press outside it to the map — the pin's hit slop never sees it.
      const frame = pinUnion(paris.x, paris.y, null);
      const target = pinTarget(paris.x, paris.y, null);
      const ring = { x: frame.right + 6, y: (frame.top + frame.bottom) / 2 };
      expect(ring.x).toBeGreaterThan(frame.right);
      expect(ring.x).toBeLessThan(target.right);
      expect(mapboxPress(ios(ring.x, ring.y), seen(), never)).toEqual({ kind: "pin", code: "CDG" });
      expect(mapboxPress(ios(paris.x - 9 - 12, paris.y + 8), seen(), never)).toEqual({ kind: "pin", code: "CDG" });
      // The pin's own press answered first (Android may send both): still the pin's — the guard chooses once.
      expect(mapboxPress(ios(ring.x, ring.y), seen(), lately)).toEqual({ kind: "pin", code: "CDG" });
      // Past the target, the place.
      expect(mapboxPress(ios(target.right + 2, ring.y), seen(), never)?.kind).toBe("place");
    });

    it("elsewhere on the disc, the place Mapbox gives, where it stands on screen", () => {
      const tap = placeOf(mapboxPress(ios(centre.x + 40, centre.y - 30), seen(), never))!;
      expect(tap.x).toBeCloseTo(centre.x + 40, 6);
      expect(tap.y).toBeCloseTo(centre.y - 30, 6);
      const p = tap.project({ lng: 2.55, lat: 49.01 })!;
      expect(p.x).toBeCloseTo(paris.x, 6);
      expect(p.y).toBeCloseTo(paris.y, 6);
    });

    it("the sky, a chosen route and a touch a pin's press answered are nothing", () => {
      expect(mapboxPress({ lng: 90, lat: 0, screen: { x: centre.x + r, y: centre.y } }, seen(), never)).toBeNull();
      expect(
        mapboxPress({ lng: 30, lat: 10, screen: { x: centre.x + r + 30, y: centre.y } }, seen(), never),
      ).toBeNull();
      expect(mapboxPress(ios(centre.x, centre.y), seen({ route: true }), never)).toBeNull();
      expect(mapboxPress(ios(paris.x, paris.y - 10), seen({ route: true }), never)).toBeNull();
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
