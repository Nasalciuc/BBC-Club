import { describe, expect, it } from "bun:test";
import type { EstimateVM, FareVM } from "@bbc/shared/api/v1/fares";

import { wantsQuoteFooter } from "./quote-footer";

const fare = { id: "f1" } as unknown as FareVM;
const estimate = { amount: 4200, currency: "USD" } as unknown as EstimateVM;

describe("wantsQuoteFooter", () => {
  it("docks over fares and over an estimate", () => {
    expect(wantsQuoteFooter({ status: "done", results: [fare], estimate: null }, false)).toBe(true);
    expect(wantsQuoteFooter({ status: "empty", results: [], estimate }, false)).toBe(true);
  });

  it("docks while searching is paused, even before the new destination's first answer (429)", () => {
    expect(wantsQuoteFooter({ status: "paused", results: null, estimate: null }, false)).toBe(true);
    expect(wantsQuoteFooter({ status: "paused", results: [fare], estimate: null }, false)).toBe(true);
  });

  it("never beside an EmptyState's own button, while searching, on an error or offline", () => {
    expect(wantsQuoteFooter({ status: "empty", results: [], estimate: null }, false)).toBe(false);
    expect(wantsQuoteFooter({ status: "searching", results: null, estimate: null }, false)).toBe(false);
    expect(wantsQuoteFooter({ status: "error", results: null, estimate: null }, false)).toBe(false);
    expect(wantsQuoteFooter({ status: "done", results: [fare], estimate: null }, true)).toBe(false);
    expect(wantsQuoteFooter({ status: "paused", results: null, estimate: null }, true)).toBe(false);
  });
});
