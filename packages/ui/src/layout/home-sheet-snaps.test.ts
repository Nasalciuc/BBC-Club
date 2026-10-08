import { describe, expect, it } from "bun:test";

import { HOME_SHEET_SNAPS, homeSheetHeight } from "./home-sheet-snaps";

describe("homeSheetHeight", () => {
  it("covers each snap's share of the container — Figma's 300 / 544 / 656 pt sheets on a 768 pt container", () => {
    expect(HOME_SHEET_SNAPS).toEqual([0.39, 0.71, 0.85]);
    expect(homeSheetHeight(0, 768)).toBe(300);
    expect(homeSheetHeight(1, 768)).toBe(545);
    expect(homeSheetHeight(2, 768)).toBe(653);
  });

  it("never covers the whole container — the header's Cancel / Done stay above the sheet", () => {
    for (const f of HOME_SHEET_SNAPS) expect(f).toBeLessThan(1);
    expect(homeSheetHeight(2, 768)).toBeLessThanOrEqual(768 - 104);
  });

  it("clamps an index the sheet does not have", () => {
    expect(homeSheetHeight(-1, 600)).toBe(234);
    expect(homeSheetHeight(7, 600)).toBe(510);
  });
});
