import { describe, expect, test } from "bun:test";
import { airportSearchState } from "./airport-search-state";

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
