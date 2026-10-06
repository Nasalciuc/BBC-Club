import { describe, expect, it } from "bun:test";

import { HOME_SHEET_SNAPS, homeSheetHeight } from "./home-sheet-snaps";

describe("homeSheetHeight", () => {
  it("covers each snap's share of the container", () => {
    expect(HOME_SHEET_SNAPS).toEqual([0.35, 0.6, 1]);
    expect(homeSheetHeight(0, 768)).toBe(269);
    expect(homeSheetHeight(1, 768)).toBe(461);
    expect(homeSheetHeight(2, 768)).toBe(768);
  });

  it("clamps an index the sheet does not have", () => {
    expect(homeSheetHeight(-1, 600)).toBe(210);
    expect(homeSheetHeight(7, 600)).toBe(600);
  });
});
