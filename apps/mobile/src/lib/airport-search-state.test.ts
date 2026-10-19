import { describe, expect, test } from "bun:test";
import { airportSearchState, chosenAirportLabel, homeAirportLabel, wantsAirportSearch } from "./airport-search-state";

const jfk = { code: "JFK", city: "New York", name: "John F. Kennedy", countryCode: "US" };

/** A failed request as the API answers it — more than the state reads (only `ok`). */
const offline = { ok: false as const, message: "offline", status: 0 };

describe("airportSearchState", () => {
  test("a successful empty response is empty", () => {
    expect(airportSearchState({ ok: true, data: [] })).toEqual({ phase: "empty", airports: [] });
  });

  test("a successful response with airports is results", () => {
    expect(airportSearchState({ ok: true, data: [jfk] })).toEqual({ phase: "results", airports: [jfk] });
  });

  test("a failed request is an error with no airports", () => {
    expect(airportSearchState(offline)).toEqual({
      phase: "error",
      airports: [],
    });
  });

  test("a failure after a previous success does not keep the old airports", () => {
    const shown = airportSearchState({ ok: true, data: [jfk] });
    expect(shown.phase).toBe("results");
    const next = airportSearchState(offline);
    expect(next).toEqual({ phase: "error", airports: [] });
    expect(next.airports).not.toBe(shown.airports);
  });
});

describe("wantsAirportSearch", () => {
  test("searches from two characters", () => {
    expect(wantsAirportSearch("N", null)).toBe(false);
    expect(wantsAirportSearch(" N ", null)).toBe(false);
    expect(wantsAirportSearch("Ne", null)).toBe(true);
  });

  test("never searches the words of the airport just chosen — the list stays closed under the choice", () => {
    expect(chosenAirportLabel(jfk)).toBe("New York · JFK");
    expect(wantsAirportSearch("New York · JFK", jfk)).toBe(false);
  });

  test("searches again as soon as the member changes the words", () => {
    expect(wantsAirportSearch("New York · JF", jfk)).toBe(true);
    expect(wantsAirportSearch("New York · JFK", null)).toBe(true);
  });
});

describe("homeAirportLabel", () => {
  test("names the city with its code after it, as Profile and Edit profile do (12, 36)", () => {
    expect(homeAirportLabel("JFK", "New York")).toBe("New York (JFK)");
  });

  test("keeps the code alone while the city is unknown", () => {
    expect(homeAirportLabel("JFK", null)).toBe("JFK");
    expect(homeAirportLabel("JFK", "")).toBe("JFK");
  });
});
