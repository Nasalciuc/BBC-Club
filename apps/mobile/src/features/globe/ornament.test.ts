import { describe, expect, it } from "bun:test";

import { ORNAMENT, isZoomedIn, ornamentRect } from "./ornament";

describe("ornamentRect", () => {
  it("is the top-right corner both take, 8 pt from the edge, for the labels to keep out of", () => {
    const r = ornamentRect(109, 393);
    expect(r.right).toBe(393 - ORNAMENT.inset);
    expect(r.left).toBe(393 - 8 - 22 - 4 - 85);
    expect(r.top).toBe(109);
    expect(r.bottom).toBe(109 + 22);
  });

  it("grows by its pad on every side", () => {
    const r = ornamentRect(109, 393, 4);
    expect(r).toEqual({ left: 393 - 8 - 22 - 4 - 85 - 4, top: 105, right: 389, bottom: 135 });
  });
});

describe("isZoomedIn", () => {
  it("is the globe pinched past its rest size, not the rest turn's ease back", () => {
    const rest = 1.37;
    expect(isZoomedIn(rest, rest)).toBe(false);
    expect(isZoomedIn(rest + 0.04, rest)).toBe(false);
    expect(isZoomedIn(rest + 0.3, rest)).toBe(true);
    // A long route's framing goes below the rest size: never "in".
    expect(isZoomedIn(rest - 1, rest)).toBe(false);
  });
});
