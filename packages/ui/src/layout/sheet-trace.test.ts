import { describe, expect, it } from "bun:test";

import { type SheetLook, formatSheetLook, sheetVerdict } from "./sheet-trace";

// Made-up numbers on a 915-pt window: the rest stop's top at 517, the route's at 300.
const atRest: SheetLook = { index: 0, sheetIndex: 0, position: 517, drawnTop: 517, windowHeight: 915 };

describe("sheetVerdict", () => {
  it("is drawn when gorhom holds the stop asked for and the sheet is drawn there", () => {
    expect(sheetVerdict(atRest)).toBe("drawn");
    expect(sheetVerdict({ ...atRest, drawnTop: 518.6 })).toBe("drawn");
    expect(sheetVerdict({ ...atRest, index: 1, sheetIndex: 1, position: 300, drawnTop: 300 })).toBe("drawn");
  });

  it("is lost when gorhom holds the sheet open but it is drawn a window height down (its first frame)", () => {
    expect(sheetVerdict({ ...atRest, drawnTop: 915 })).toBe("lost");
    expect(sheetVerdict({ ...atRest, drawnTop: 914.2 })).toBe("lost");
    expect(sheetVerdict({ ...atRest, drawnTop: 1430 })).toBe("lost");
    // gorhom at another stop than asked, drawn off the screen: the drawing is what is wrong first.
    expect(sheetVerdict({ ...atRest, sheetIndex: 1, position: 300, drawnTop: 915 })).toBe("lost");
  });

  it("is closed when gorhom itself has the sheet closed, wherever it is drawn", () => {
    expect(sheetVerdict({ ...atRest, sheetIndex: -1, position: 915, drawnTop: 915 })).toBe("closed");
    expect(sheetVerdict({ ...atRest, sheetIndex: -0.995, position: 914, drawnTop: 914 })).toBe("closed");
  });

  it("is moving between two stops", () => {
    expect(sheetVerdict({ ...atRest, sheetIndex: 0.4, position: 430, drawnTop: 430 })).toBe("moving");
    expect(sheetVerdict({ ...atRest, sheetIndex: -0.5, position: 716, drawnTop: 716 })).toBe("moving");
  });

  it("is astray when gorhom holds another stop than the one asked for", () => {
    expect(sheetVerdict({ ...atRest, sheetIndex: 1, position: 300, drawnTop: 300 })).toBe("astray");
    expect(sheetVerdict({ ...atRest, sheetIndex: 2.004, position: 80, drawnTop: null })).toBe("astray");
  });

  it("is unmeasured when gorhom holds the stop and the drawn top is unknown", () => {
    expect(sheetVerdict({ ...atRest, drawnTop: null })).toBe("unmeasured");
  });

  it("is elsewhere when the sheet is on screen but not where gorhom puts it", () => {
    expect(sheetVerdict({ ...atRest, drawnTop: 560 })).toBe("elsewhere");
    expect(sheetVerdict({ ...atRest, drawnTop: 0 })).toBe("elsewhere");
  });
});

describe("formatSheetLook", () => {
  it("prints the verdict, then the numbers rounded to the point", () => {
    expect(formatSheetLook({ ...atRest, position: 516.6, drawnTop: 516.7, windowHeight: 914.9 })).toBe(
      "[HomeSheet] drawn index=0 sheet=0.00 position=517 top=517 window=915",
    );
    expect(formatSheetLook({ ...atRest, drawnTop: 915 })).toBe(
      "[HomeSheet] lost index=0 sheet=0.00 position=517 top=915 window=915",
    );
  });

  it("prints an unknown drawn top as ?", () => {
    expect(formatSheetLook({ ...atRest, sheetIndex: 0.25, drawnTop: null })).toBe(
      "[HomeSheet] moving index=0 sheet=0.25 position=517 top=? window=915",
    );
  });
});
