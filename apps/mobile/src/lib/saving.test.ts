import { describe, expect, it } from "bun:test";

import { savingPercent } from "./saving";

describe("savingPercent", () => {
  it("works the saving out from the published fare, rounded down", () => {
    expect(savingPercent({ offer: 3450, published: 7500 })).toBe(54);
    expect(savingPercent({ offer: 3850, published: 6900 })).toBe(44);
    expect(savingPercent({ offer: 4200, published: 7850 })).toBe(46);
  });

  it("says nothing without a published fare on record, or without a saving", () => {
    expect(savingPercent({ offer: 3450 })).toBeNull();
    expect(savingPercent({ offer: 3450, published: 3450 })).toBeNull();
    expect(savingPercent({ offer: 9990, published: 10_000 })).toBeNull();
  });
});
