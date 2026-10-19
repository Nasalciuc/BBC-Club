import { describe, expect, it } from "bun:test";
import { geoDistance } from "d3-geo";
import {
  GLOBE_SPEC,
  OPENING_VIEW,
  ROUTE_BOX,
  approach,
  atView,
  detailFor,
  dragRotation,
  globeMode,
  greatCircle,
  isOnNearSide,
  normalizeLambda,
  panBy,
  pinchBy,
  planeOnRoute,
  projector,
  ROUTE_REACH_DEG,
  ROUTE_TILT_DEG,
  rotationAt,
  routeTilt,
  routeView,
  touchesAfter,
  type GlobeInputs,
  type LonLat,
  type Point,
  type Rotation,
} from "./globe-logic";

const JFK: LonLat = [-73.78, 40.64],
  LHR: LonLat = [-0.45, 51.47],
  CDG: LonLat = [2.55, 49.01],
  DXB: LonLat = [55.36, 25.25],
  HND: LonLat = [139.78, 35.55],
  SIN: LonLat = [103.99, 1.36],
  SYD: LonLat = [151.18, -33.95],
  YYZ: LonLat = [-79.63, 43.68],
  ORD: LonLat = [-87.9, 41.98];
const C = GLOBE_SPEC.frame / 2;
const fromCentre = (p: Point | null): Point => {
  if (!p) throw new Error("expected a point on the near side");
  return [p[0] - C, p[1] - C];
};
const base: GlobeInputs = {
  reducedMotion: false,
  appActive: true,
  interacting: false,
  selected: null,
  msSinceInteraction: null,
  atTarget: true,
};

describe("the opening view (image 02)", () => {
  const p = projector(GLOBE_SPEC.frame, GLOBE_SPEC.opening);
  it("draws a globe 336 pt across", () => {
    expect(GLOBE_SPEC.radius * 2).toBe(336);
  });
  it("centres Dubai, with London and Paris up at the left and Tokyo at the right", () => {
    const [dx, dy] = fromCentre(p.point(DXB));
    expect(Math.hypot(dx, dy)).toBeLessThan(8);
    const [lx, ly] = fromCentre(p.point(LHR));
    expect(lx).toBeLessThan(-60);
    expect(ly).toBeLessThan(-60);
    const [cx, cy] = fromCentre(p.point(CDG));
    expect(cx).toBeLessThan(-60);
    expect(cy).toBeLessThan(-60);
    const [tx] = fromCentre(p.point(HND));
    expect(tx).toBeGreaterThan(100);
    expect(tx).toBeLessThan(GLOBE_SPEC.radius);
  });
  it("hides New York on the far hemisphere", () => {
    expect(p.point(JFK)).toBeNull();
    expect(isOnNearSide(DXB, GLOBE_SPEC.opening)).toBe(true);
  });
});

describe("routeView (image 13)", () => {
  it("frames a route inside the route's box once lifted — an arc that bows up, not a line", () => {
    for (const dest of [LHR, CDG, DXB, HND]) {
      const v = routeView(JFK, dest);
      const q = projector(GLOBE_SPEC.frame, v.rotation, v.zoom);
      // on screen the globe's centre stands `lift` below the box's middle
      const onScreen = (p: LonLat): Point => {
        const [x, y] = fromCentre(q.point(p));
        return [x, y + v.lift];
      };
      for (const end of [JFK, dest]) {
        const [x, y] = onScreen(end);
        expect(Math.abs(x)).toBeLessThanOrEqual(ROUTE_BOX.halfWidth + 1e-6);
        expect(Math.abs(y)).toBeLessThanOrEqual(ROUTE_BOX.halfHeight + 1e-6);
      }
      expect(v.lift).toBeGreaterThan(0);
      const plane = planeOnRoute(q, JFK, dest);
      expect(plane).not.toBeNull();
      if (!plane) continue;
      const [px, py] = fromCentre(plane.at);
      expect(Math.abs(px)).toBeLessThan(1);
      // the middle stands above the line between the ends: the route bows up
      const [ax, ay] = fromCentre(q.point(JFK));
      const [bx, by] = fromCentre(q.point(dest));
      const chordY = ay + ((by - ay) * (px - ax)) / (bx - ax);
      expect(py).toBeLessThan(chordY - 8);
    }
  });
  it("keeps a short route nearly level, so the zoomed globe is never lifted off its frame", () => {
    // London to Paris from London; New York to Toronto and to Chicago: the zoom at its closest, the lift small.
    for (const [from, to] of [
      [LHR, CDG],
      [JFK, YYZ],
      [JFK, ORD],
    ] as const) {
      const v = routeView(from, to);
      expect(v.zoom).toBe(GLOBE_SPEC.routeZoom.max);
      expect(Math.abs(v.lift)).toBeLessThan(100);
    }
    expect(routeTilt(1.55)).toBeCloseTo(1.94, 2);
    expect(routeTilt(25)).toBe(ROUTE_TILT_DEG);
  });
  it("keeps both ends of a route nearly across the world on the near side", () => {
    for (const to of [SIN, SYD]) {
      const v = routeView(JFK, to);
      const centre: LonLat = [-v.rotation[0], -v.rotation[1]];
      for (const end of [JFK, to]) {
        expect((geoDistance([end[0], end[1]], [centre[0], centre[1]]) * 180) / Math.PI).toBeLessThanOrEqual(
          ROUTE_REACH_DEG + 1e-6,
        );
      }
    }
  });
  it("comes closer for London than for Tokyo, and holds the long way to Singapore at its widest", () => {
    expect(routeView(JFK, LHR).zoom).toBeGreaterThan(routeView(JFK, HND).zoom);
    expect(routeView(JFK, SIN).zoom).toBe(GLOBE_SPEC.routeZoom.min);
  });
  it("puts London up and right of New York, as 13 draws them", () => {
    const v = routeView(JFK, LHR);
    const q = projector(GLOBE_SPEC.frame, v.rotation, v.zoom);
    const [jx, jy] = fromCentre(q.point(JFK));
    const [lx, ly] = fromCentre(q.point(LHR));
    expect(jx).toBeLessThan(0);
    expect(lx).toBeGreaterThan(0);
    expect(ly).toBeLessThan(jy);
  });
  it("centres the destination when the member has no home airport", () => {
    const v = routeView(null, LHR);
    expect(normalizeLambda(-v.rotation[0])).toBeCloseTo(LHR[0], 6);
    expect(-v.rotation[1]).toBeCloseTo(LHR[1], 6);
    expect(v.zoom).toBe(2);
    expect(v.lift).toBe(0);
  });
  it("draws the route as a great circle the projection clips at the horizon", () => {
    const line = greatCircle(JFK, LHR) as { type: string; coordinates: number[][] };
    expect(line.type).toBe("LineString");
    expect(line.coordinates).toHaveLength(49);
    expect(line.coordinates[0]?.[0]).toBeCloseTo(JFK[0], 6);
    expect(line.coordinates.at(-1)?.[1]).toBeCloseTo(LHR[1], 6);
  });
});

describe("motion", () => {
  it("one turn in 120 s; the loop closes on the same longitude", () => {
    expect(rotationAt(0)).toBeCloseTo(-55, 6);
    expect(rotationAt(120_000)).toBeCloseTo(-55, 6);
    expect(rotationAt(60_000)).toBeCloseTo(125, 6);
    expect(rotationAt(1_000)).toBeCloseTo(-52, 6);
  });
});

describe("globeMode — priority", () => {
  it("background pauses everything", () =>
    expect(globeMode({ ...base, appActive: false, reducedMotion: true })).toBe("paused"));
  it("a finger on the globe pauses it", () =>
    expect(globeMode({ ...base, interacting: true, selected: "LHR" })).toBe("paused"));
  it("reduced motion is still", () =>
    expect(globeMode({ ...base, reducedMotion: true, selected: "LHR", atTarget: false })).toBe("still"));
  it("a selection flies to its route, then holds it", () => {
    expect(globeMode({ ...base, selected: "LHR", atTarget: false })).toBe("framing");
    expect(globeMode({ ...base, selected: "LHR", atTarget: true })).toBe("still");
  });
  it("waits 4 s after an interaction, then rotates", () => {
    expect(globeMode({ ...base, msSinceInteraction: 3_999 })).toBe("paused");
    expect(globeMode({ ...base, msSinceInteraction: 4_000 })).toBe("rotating");
    expect(globeMode(base)).toBe("rotating");
  });
});

describe("gestures and detail", () => {
  it("a drag of one radian-pixel turns one degree; tilt is clamped", () => {
    expect(dragRotation([30, -35], (168 * Math.PI) / 180, 0, 168)[0]).toBeCloseTo(31, 6);
    expect(dragRotation([30, -35], 0, -1e6, 168)[1]).toBe(GLOBE_SPEC.tilt.max);
  });
  it("approaching takes the short way across the date line and lands exactly", () => {
    const first = approach({ rotation: [170, -35], zoom: 1 }, { rotation: [-170, -35], zoom: 1 }, 16);
    expect(normalizeLambda(first.rotation[0] - 170)).toBeGreaterThan(0);
    let s: { rotation: Rotation; zoom: number; done: boolean } = { rotation: [170, -35], zoom: 2, done: false };
    for (let i = 0; i < 400 && !s.done; i++) s = approach(s, OPENING_VIEW, 16);
    expect(s.done).toBe(true);
    expect(atView(s, OPENING_VIEW)).toBe(true);
  });
  it("detail: low under a finger, high when still or zoomed, mid while moving", () => {
    expect(detailFor("paused", true, 1)).toBe("low");
    expect(detailFor("rotating", false, 1)).toBe("mid");
    expect(detailFor("framing", false, 1)).toBe("mid");
    expect(detailFor("still", false, 1)).toBe("high");
    expect(detailFor("rotating", false, 2)).toBe("high");
  });
});

describe("pan and pinch together (Gesture.Simultaneous)", () => {
  const size = GLOBE_SPEC.frame;
  const degPerPx = (zoom: number) => 180 / Math.PI / ((size * GLOBE_SPEC.radius * zoom) / GLOBE_SPEC.frame);
  it("a pinch that ends mid-drag leaves the pan in control", () => {
    let touches = touchesAfter(0, "begin"); // pan
    touches = touchesAfter(touches, "begin"); // pinch
    touches = touchesAfter(touches, "end"); // one finger lifts: the pinch ends
    expect(touches).toBe(1); // still touched: no resume, no freeze
    const v = panBy({ rotation: [30, -35], zoom: 1 }, 10, 0, size);
    expect(v.rotation[0]).toBeCloseTo(30 + 10 * degPerPx(1), 9);
  });
  it("a pinch that starts mid-drag never replays the distance already dragged", () => {
    let v = { rotation: [30, -35] as Rotation, zoom: 1 };
    for (let i = 0; i < 5; i++) v = panBy(v, 10, 0, size); // 50 px
    const before = v.rotation[0];
    v = pinchBy(v, 1); // the pinch begins without changing scale
    expect(v.rotation[0]).toBe(before);
    for (let i = 0; i < 5; i++) v = panBy(v, 10, 0, size); // 50 px more
    expect(v.rotation[0]).toBeCloseTo(30 + 100 * degPerPx(1), 9);
  });
  it("zooming mid-drag never rescales the past: later pixels turn fewer degrees", () => {
    let v = panBy({ rotation: [30, -35], zoom: 1 }, 100, 0, size);
    const afterFirst = v.rotation[0];
    v = pinchBy(v, 2);
    expect(v.rotation[0]).toBe(afterFirst);
    v = panBy(v, 100, 0, size);
    expect(v.rotation[0] - afterFirst).toBeCloseTo(100 * degPerPx(2), 9);
    expect(v.rotation[0] - afterFirst).toBeCloseTo((afterFirst - 30) / 2, 9);
  });
  it("pinches compose and stay within the zoom limits; the touch count never goes negative", () => {
    let v = { rotation: [30, -35] as Rotation, zoom: 1 };
    for (let i = 0; i < 10; i++) v = pinchBy(v, 1.5);
    expect(v.zoom).toBe(GLOBE_SPEC.zoom.max);
    expect(touchesAfter(touchesAfter(0, "end"), "end")).toBe(0);
  });
  it("a pinch on a long route starts from its framing, never jumping up to the rest size", () => {
    const framed = { rotation: [30, -35] as Rotation, zoom: 0.8 };
    expect(pinchBy(framed, 1.01, GLOBE_SPEC.routeZoom.min).zoom).toBeCloseTo(0.808, 6);
    expect(pinchBy(framed, 0.5, GLOBE_SPEC.routeZoom.min).zoom).toBe(GLOBE_SPEC.routeZoom.min);
    expect(pinchBy(framed, 1.01).zoom).toBe(GLOBE_SPEC.zoom.min);
  });
});
