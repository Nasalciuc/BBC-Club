/** ADR-IMPL-068: a tap anywhere on the globe — where it lands, whether it is a tap at all, and whose it is. */
import { describe, expect, it } from "bun:test";
import { geoDistance, geoOrthographic } from "d3-geo";

import { radiusAtZoom, onGlobeDisc } from "./globe-geo";
import {
  GLOBE_SPEC,
  OPENING_VIEW,
  PAN_START,
  PRESS_GUARD_MS,
  TAP,
  createPressGuard,
  projector,
  radiusFor,
  touchKind,
  type LonLat,
  type TouchPoint,
} from "./globe-logic";
import { labelBox, pinAt, pinTarget, type PlacedPin } from "./pin-labels";

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

describe("a tap is never a drag", () => {
  const tap = (dx: number, dy: number, ms: number): TouchPoint[] => [
    { x: 100, y: 100, t: 0 },
    { x: 100 + dx / 2, y: 100 + dy / 2, t: ms / 2 },
    { x: 100 + dx, y: 100 + dy, t: ms },
  ];

  it("a still finger lifted in time is a tap; one held is nothing; one that moves the pan's start is a drag", () => {
    expect(TAP.maxDistance).toBe(PAN_START);
    expect(touchKind(tap(0, 0, 120))).toBe("tap");
    expect(touchKind(tap(5, 5, 300))).toBe("tap"); // 7.1 pt: still a tap
    expect(touchKind(tap(0, 0, TAP.maxDurationMs + 1))).toBe("none");
    expect(touchKind(tap(PAN_START, 0, 80))).toBe("drag");
    expect(touchKind([])).toBe("none");
  });

  it("a finger that drags away and comes back is still a drag", () => {
    expect(
      touchKind([
        { x: 0, y: 0, t: 0 },
        { x: 30, y: 0, t: 60 },
        { x: 1, y: 0, t: 120 },
      ]),
    ).toBe("drag");
  });

  it("10 swipes across the globe fire 0 taps, however short or quick", () => {
    const swipes: TouchPoint[][] = Array.from({ length: 10 }, (_, i) => {
      const angle = (i * 36 * Math.PI) / 180;
      const length = 12 + i * 20; // 12 to 192 pt
      const ms = 60 + i * 40;
      return Array.from({ length: 6 }, (_, k) => ({
        x: 380 + (Math.cos(angle) * (length * k)) / 5,
        y: 380 + (Math.sin(angle) * (length * k)) / 5,
        t: (ms * k) / 5,
      }));
    });
    const kinds = swipes.map(touchKind);
    expect(kinds.filter((k) => k === "tap")).toHaveLength(0);
    expect(kinds.every((k) => k === "drag")).toBe(true);
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
