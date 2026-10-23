import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import { INITIAL_SEARCH, type SearchState } from "../search/search-logic";

import { summaryIsMessage, summaryKind, summaryRetries } from "./destination-summary-logic";

const state = (patch: Partial<SearchState>): SearchState => ({ ...INITIAL_SEARCH, ...patch });
const fare = fixture.fares[0]!;

describe("the destination's summary (13, 04, 19)", () => {
  it("'Searching paused' with no fare to show offers Try again — the search never reruns by itself (F102)", () => {
    const paused = state({ status: "paused", results: null });
    expect(summaryKind(paused, false)).toBe("paused");
    expect(summaryIsMessage("paused")).toBe(true);
    expect(summaryRetries("paused")).toBe(true);
  });

  it("paused over fares already shown keeps the fare, its note in the note's place", () => {
    expect(summaryKind(state({ status: "paused", results: [fare] }), false)).toBe("fare");
  });

  it("offline, an error and paused retry; a fare, an estimate, no fare and loading do not", () => {
    expect(summaryKind(state({ status: "done", results: [fare] }), true)).toBe("offline");
    expect(summaryKind(state({ status: "error" }), false)).toBe("error");
    expect(summaryKind(state({ status: "searching" }), false)).toBe("loading");
    expect(summaryKind(state({ status: "idle" }), false)).toBe("loading");
    expect(summaryKind(state({ status: "done", results: [fare] }), false)).toBe("fare");
    const estimate = {
      amount: 3900,
      currency: "USD",
      trip: "round_trip",
      cabin: "business",
      basis: "formula",
    } as const;
    expect(summaryKind(state({ status: "empty", results: [], estimate }), false)).toBe("estimate");
    expect(summaryKind(state({ status: "empty", results: [] }), false)).toBe("empty");
    expect(["offline", "error", "paused"].every((k) => summaryRetries(k as never))).toBe(true);
    expect(["fare", "estimate", "empty", "loading"].some((k) => summaryRetries(k as never))).toBe(false);
    expect(summaryIsMessage("empty")).toBe(true);
    expect(summaryIsMessage("fare")).toBe(false);
  });
});
