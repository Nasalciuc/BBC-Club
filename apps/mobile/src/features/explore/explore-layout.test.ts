import { describe, expect, it } from "bun:test";

import { EXPLORE, globeCentreY, routeTop, sheetSnaps, sheetTop } from "./explore-layout";

// The images: a 393 × 852 phone, a 47-pt status bar, an 82-pt tab bar — a 770-pt container.
const H = 770;
const INSET = 47;

describe("sheetSnaps", () => {
  it("lands the sheet where the images draw it: 362 at rest, a route as high as its first flight needs, 128 for all", () => {
    // The images' phone keeps 453 pt for a route's sheet at 317; the first flight needs 476: the sheet stands at 294.
    expect(sheetSnaps(H, INSET).map((h) => H - h)).toEqual([362, 294, 128]);
  });

  it("raises a route's sheet on a shorter phone so its first flight stays above the pill, up to the route's box", () => {
    // A taller phone keeps the image's 317; an iPhone 15 (59-pt bar, 769 above the tab bar) rises to 293; an SE stops
    // at the highest the route allows.
    expect(routeTop(900, INSET)).toBe(EXPLORE.routeTop);
    expect(routeTop(769, 59)).toBe(234);
    expect(routeTop(618, 20)).toBe(EXPLORE.routeTopMin);
    expect(H - INSET - routeTop(H, INSET)).toBeGreaterThanOrEqual(EXPLORE.routeContent);
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
  it("puts the globe at 266 at rest and a route's middle at 165 (02, 13)", () => {
    expect(globeCentreY(false, INSET)).toBe(266);
    expect(globeCentreY(true, INSET)).toBe(165);
  });
});
