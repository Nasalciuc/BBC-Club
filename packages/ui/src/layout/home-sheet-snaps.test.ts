import { describe, expect, it } from "bun:test";

import { HOME_SHEET_SNAPS, homeSheetHeight } from "./home-sheet-snaps";

describe("homeSheetHeight", () => {
  it("lands on Figma's 300 / 544 / 656 pt sheets on the 768 pt container", () => {
    expect(homeSheetHeight(0, 768)).toBe(300);
    expect(homeSheetHeight(1, 768)).toBe(544);
    expect(homeSheetHeight(2, 768)).toBe(656);
  });

  it("never covers the whole container — the header's Cancel / Done stay above the sheet", () => {
    for (const f of HOME_SHEET_SNAPS) expect(f).toBeLessThan(1);
    expect(homeSheetHeight(2, 768)).toBeLessThanOrEqual(768 - 104);
  });

  it("clamps an index the sheet does not have", () => {
    expect(homeSheetHeight(-1, 600)).toBe(234);
    expect(homeSheetHeight(7, 600)).toBe(513);
  });
});
