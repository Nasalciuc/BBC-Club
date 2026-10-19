import { describe, expect, it } from "bun:test";

import { EXPLORE, globeCentreY, routeTop, sheetSnaps, sheetTop } from "./explore-layout";

// The images: a 393 × 852 phone with a 47-pt status bar, over the app's tab bar (79.4 pt and its hairline) — a
// 772.1-pt container.
const H = 772.1;
const INSET = 47;

describe("sheetSnaps", () => {
  it("lands the sheet where the images draw it: 362 at rest, a route at 327.2, 128 for every offer", () => {
    const tops = sheetSnaps(H, INSET).map((h) => H - h);
    expect(tops[0]).toBeCloseTo(362, 6);
    expect(tops[1]).toBeCloseTo(327.2, 6);
    expect(tops[2]).toBeCloseTo(128, 6);
  });

  it("raises a route's sheet on a shorter phone so its first flight stays above the pill, up to the route's box", () => {
    // A taller phone keeps the image's 280.2 under the status bar; an iPhone 15 (59-pt bar, 769 above the tab bar)
    // rises to 265.1; an SE stops at the highest the route allows.
    expect(routeTop(900, INSET)).toBe(EXPLORE.routeTop);
    expect(routeTop(769, 59)).toBeCloseTo(265.1, 6);
    expect(routeTop(618, 20)).toBe(EXPLORE.routeTopMin);
    expect(H - INSET - routeTop(H, INSET)).toBeGreaterThanOrEqual(EXPLORE.routeContent - 1e-9);
  });

  it("rises from one stop to the next, and keeps a sheet on a short phone", () => {
    const [a, b, c] = sheetSnaps(400, 20);
    expect(a).toBeGreaterThanOrEqual(120);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe("sheetTop", () => {
  it("reads the stop's top, clamping a stop the sheet does not have", () => {
    expect(sheetTop(1, H, INSET)).toBe(INSET + routeTop(H, INSET));
    expect(sheetTop(-1, H, INSET)).toBe(INSET + EXPLORE.restTop);
    expect(sheetTop(9, H, INSET)).toBe(INSET + EXPLORE.allTop);
  });
});

describe("globeCentreY", () => {
  it("puts the globe at 266 at rest and a route's middle at 159.4 (02, 13)", () => {
    expect(globeCentreY(false, INSET)).toBe(266);
    expect(globeCentreY(true, INSET)).toBeCloseTo(159.4, 6);
  });
});
