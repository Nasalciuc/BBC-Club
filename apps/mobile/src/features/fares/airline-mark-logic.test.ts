import { describe, expect, it } from "bun:test";

import { MARK_PIXELS, airlineMarkKey } from "./airline-mark-logic";

describe("airline marks (04)", () => {
  it("has a mark for the three airlines the design draws, by their codes", () => {
    expect(["BA", "vs", " AA ", "LH", null, undefined].map(airlineMarkKey)).toEqual([
      "BA",
      "VS",
      "AA",
      null,
      null,
      null,
    ]);
  });

  it("sets each mark at the size the image draws it", () => {
    expect(MARK_PIXELS.BA.width).toBeCloseTo(81.65, 1);
    expect(MARK_PIXELS.BA.height).toBeCloseTo(28.6, 1);
    expect(MARK_PIXELS.VS.height).toBeCloseTo(46.13, 1);
    expect(MARK_PIXELS.AA.width).toBeCloseTo(79.34, 1);
  });
});
