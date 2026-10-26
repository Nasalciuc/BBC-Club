import { describe, expect, it } from "bun:test";

import type { LonLat } from "./globe-logic";
import { landFor } from "./land";
import { routeMap } from "./route-map-logic";

const JFK: LonLat = [-73.78, 40.64];
const LHR: LonLat = [-0.45, 51.47];
const SIN: LonLat = [103.99, 1.36];
const SIZE = { width: 321, height: 112 };
const PAD = { x: 72, top: 22, bottom: 26 };

describe("routeMap (05, sheet 40 · 08)", () => {
  it("fits the route in the card with room beside each end for its code and city", () => {
    const map = routeMap(JFK, LHR, landFor("mid"), SIZE);
    for (const [x, y] of [map.from, map.to]) {
      expect(x).toBeGreaterThanOrEqual(PAD.x - 0.5);
      expect(x).toBeLessThanOrEqual(SIZE.width - PAD.x + 0.5);
      expect(y).toBeGreaterThanOrEqual(PAD.top - 0.5);
      expect(y).toBeLessThanOrEqual(SIZE.height - PAD.bottom + 0.5);
    }
    // New York at the left, London at the right.
    expect(map.from[0]).toBeLessThan(map.to[0]);
  });

  it("bows the route up, the plane at its middle heading east", () => {
    const map = routeMap(JFK, LHR, landFor("mid"), SIZE);
    const plane = map.plane;
    expect(plane).not.toBeNull();
    if (!plane) return;
    const chordY = (map.from[1] + map.to[1]) / 2;
    expect(plane.at[1]).toBeLessThan(chordY - 4);
    expect(Math.abs(plane.angle)).toBeLessThan(45);
  });

  it("draws the land and the route as paths", () => {
    const map = routeMap(JFK, SIN, landFor("mid"), SIZE);
    expect(map.land.startsWith("M")).toBe(true);
    expect(map.route.startsWith("M")).toBe(true);
  });
});
