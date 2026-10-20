import { describe, expect, it } from "bun:test";

import { RECENT_MAX, parseRecent, withDates, withSearch } from "./recent-search-logic";

const airport = (code: string, city: string) => ({
  code,
  city,
  name: `${city} Airport`,
  countryCode: "GB",
  lat: 51,
  lng: 0,
});
const LHR = airport("LHR", "London");
const CDG = airport("CDG", "Paris");
const NOV = { depart: "2026-11-12", return: "2026-11-19" };

describe("parseRecent", () => {
  it("reads 0.2.0's bare airports as searches without dates", () => {
    expect(parseRecent(JSON.stringify([LHR]))).toEqual([{ airport: LHR, dates: null }]);
  });

  it("reads searches with their dates, at most five", () => {
    const list = Array.from({ length: 7 }, (_, i) => ({ airport: airport(`A${i}A`, `City ${i}`), dates: NOV }));
    expect(parseRecent(JSON.stringify(list))).toHaveLength(RECENT_MAX);
  });

  it("forgets what it cannot read", () => {
    expect(parseRecent(undefined)).toEqual([]);
    expect(parseRecent("{")).toEqual([]);
    expect(parseRecent(JSON.stringify([{ code: 1 }]))).toEqual([]);
  });
});

describe("withSearch", () => {
  it("puts the destination first, once, keeping the dates it was last searched for", () => {
    let list = withSearch([], LHR, NOV);
    list = withSearch(list, CDG, null);
    list = withSearch(list, LHR, null);
    expect(list.map((r) => r.airport.code)).toEqual(["LHR", "CDG"]);
    expect(list[0]?.dates).toEqual(NOV);
  });
});

describe("withDates", () => {
  it("dates a destination already in the list and leaves the others", () => {
    const list = withDates(withSearch(withSearch([], LHR, null), CDG, null), "LHR", NOV);
    expect(list.find((r) => r.airport.code === "LHR")?.dates).toEqual(NOV);
    expect(list.find((r) => r.airport.code === "CDG")?.dates).toBeNull();
  });
});
