import { describe, expect, it } from "bun:test";

import { onRecord, publishedOnRecord, savingPercent } from "./saving";

const SOURCE = "Sabre · 16 Sep";

describe("savingPercent", () => {
  it("works the saving out from the published fare, rounded down", () => {
    expect(savingPercent({ offer: 3450, published: 7500, publishedSource: SOURCE })).toBe(54);
    expect(savingPercent({ offer: 3850, published: 6900, publishedSource: SOURCE })).toBe(44);
    expect(savingPercent({ offer: 4200, published: 7850, publishedSource: SOURCE })).toBe(46);
  });

  it("says nothing without a published fare on record, or without a saving", () => {
    expect(savingPercent({ offer: 3450 })).toBeNull();
    expect(savingPercent({ offer: 3450, published: 3450, publishedSource: SOURCE })).toBeNull();
    expect(savingPercent({ offer: 9990, published: 10_000, publishedSource: SOURCE })).toBeNull();
  });

  it("says nothing for a published fare without its source (ADR-IMPL-081): no `Save 46%` an offer cannot back", () => {
    expect(savingPercent({ offer: 4200, published: 7850 })).toBeNull();
    expect(savingPercent({ offer: 4200, published: 7850, publishedSource: "  " })).toBeNull();
  });
});

describe("onRecord (ADR-IMPL-081)", () => {
  it("takes out a published price that has no source, and keeps the rest", () => {
    const unsourced: { offer: number; published?: number; currency: string } = {
      offer: 4200,
      published: 7850,
      currency: "USD",
    };
    expect(onRecord(unsourced)).toEqual({ offer: 4200, currency: "USD" });
    expect(publishedOnRecord({ offer: 4200, published: 7850 })).toBe(false);
  });

  it("keeps a published price with its source, and a price alone, as they are", () => {
    const sourced = { offer: 4200, published: 7850, publishedSource: SOURCE, currency: "USD" };
    expect(onRecord(sourced)).toBe(sourced);
    const alone = { offer: 4200, currency: "USD" };
    expect(onRecord(alone)).toBe(alone);
  });
});
