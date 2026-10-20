import { describe, expect, it } from "bun:test";

import { lineBaseline } from "./rn-type-baseline";

describe("lineBaseline — where a line of type sets its baseline in its box", () => {
  it("centres the glyphs in a line taller than the font's own, on every platform", () => {
    const t = { fontSize: 10, lineHeight: 14 };
    // (14 − 12.1) / 2 + 9.69
    expect(lineBaseline(t, "web")).toBeCloseTo(10.64, 2);
    expect(lineBaseline(t, "android")).toBeCloseTo(10.64, 2);
    expect(lineBaseline(t, "ios")).toBeCloseTo(10.64, 2);
  });

  it("on iOS keeps the descent at the foot of a line shorter than the font's own; elsewhere centres it", () => {
    const t = { fontSize: 36.25, lineHeight: 38 };
    expect(lineBaseline(t, "ios")).toBeCloseTo(38 - 0.241 * 36.25, 2);
    expect(lineBaseline(t, "android")).toBeCloseTo((38 - 1.21 * 36.25) / 2 + 0.969 * 36.25, 2);
  });
});
