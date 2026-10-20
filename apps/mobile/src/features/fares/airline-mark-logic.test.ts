import { describe, expect, it } from "bun:test";

import { LOGO_BOX, LOGO_SLUGS, MARK_PIXELS, airlineLogoSlug, airlineMarkKey } from "./airline-mark-logic";

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

describe("the package's further logos (#76)", () => {
  it("has one for each of the fifty airlines, by its code", () => {
    expect(Object.keys(LOGO_SLUGS)).toHaveLength(50);
    expect(["AF", "ek", " JL ", "SQ", "LH", "UA"].map(airlineLogoSlug)).toEqual([
      "air-france",
      "emirates",
      "japan-airlines",
      "singapore-airlines",
      "lufthansa",
      "united-airlines",
    ]);
  });

  it("leaves the three the design draws to their crops, and knows no logo it does not carry", () => {
    expect(["BA", "VS", "AA", "ZZ", null].map(airlineLogoSlug)).toEqual([null, null, null, null, null]);
  });

  it("draws a logo in the British Airways mark's box", () => {
    expect(LOGO_BOX).toEqual({ width: MARK_PIXELS.BA.width, height: MARK_PIXELS.BA.height });
  });
});
