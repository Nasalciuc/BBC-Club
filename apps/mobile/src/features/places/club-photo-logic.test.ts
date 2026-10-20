import { describe, expect, it } from "bun:test";

import { clubCityOf } from "./club-photo-logic";

describe("clubCityOf — the design's cities by any of their airports", () => {
  it("names a city by each of its airports, in any case", () => {
    expect(["LHR", "LGW", "lcy"].map(clubCityOf)).toEqual(["london", "london", "london"]);
    expect(["CDG", "HND", "NRT", "DXB", "FCO", "JFK", "EWR", "LGA"].map(clubCityOf)).toEqual([
      "paris",
      "tokyo",
      "tokyo",
      "dubai",
      "rome",
      "new-york",
      "new-york",
      "new-york",
    ]);
  });
  it("a city the design does not draw has none", () => {
    expect([clubCityOf("SIN"), clubCityOf(""), clubCityOf(null), clubCityOf(undefined)]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
