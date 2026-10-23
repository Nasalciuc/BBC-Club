import { describe, expect, it } from "bun:test";

import { buttonHitSlop, hitSlopFor, MIN_TARGET } from "./hit-slop";

describe("hitSlopFor — a drawn element smaller than 44 pt reaches it by its slop (DESIGN.md, F024, F029)", () => {
  it("half the shortfall above and below, where the neighbours leave room", () => {
    expect(hitSlopFor(29, 20, 20)).toEqual({ top: 7.5, bottom: 7.5 });
    expect(hitSlopFor(29)).toEqual({ top: 7.5, bottom: 7.5 });
  });

  it("never past half the gap to a neighbour: rows that touch keep their drawn pitch as the target", () => {
    expect(hitSlopFor(29.65, 0, 0)).toEqual({ top: 0, bottom: 0 });
    const deleteRow = hitSlopFor(33.4, 8.8, 16);
    expect(deleteRow.top).toBeCloseTo(4.4, 5);
    // Shortfall that the top cannot take (cap 4.4) goes to the bottom while its gap allows.
    expect(deleteRow.bottom).toBeCloseTo(6.2, 5);
  });

  it("a side with no gap gives its shortfall to the other side when room remains", () => {
    // 29 pt drawn, 30 pt above, nothing below: 15 pt of top slop fits → the target is 44 pt.
    expect(hitSlopFor(29, 30, 0)).toEqual({ top: 15, bottom: 0 });
    expect(hitSlopFor(29, 0, 30)).toEqual({ top: 0, bottom: 15 });
  });

  it("an element already 44 pt or taller reaches no further", () => {
    expect(hitSlopFor(44, 20, 20)).toEqual({ top: 0, bottom: 0 });
    expect(hitSlopFor(MIN_TARGET + 12)).toEqual({ top: 0, bottom: 0 });
  });
});

describe("buttonHitSlop — the pill's target", () => {
  it("a pill drawn under 44 pt reaches 44 above and below; its width is never under 44 (its padding alone is 48)", () => {
    expect(buttonHitSlop(29)).toEqual({ top: 7.5, bottom: 7.5, left: 0, right: 0 });
    expect(buttonHitSlop(44)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(buttonHitSlop(53.8)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it("a screen that knows its neighbours sets the slop itself", () => {
    expect(buttonHitSlop(29, { top: 3, bottom: 7 })).toEqual({ top: 3, bottom: 7 });
    expect(buttonHitSlop(29, 4)).toBe(4);
  });
});
