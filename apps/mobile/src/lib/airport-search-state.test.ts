import { describe, expect, test } from "bun:test";
import {
  airportSearchState,
  chosenAirportLabel,
  homeAirportLabel,
  nearFirst,
  rowCities,
  wantsAirportSearch,
} from "./airport-search-state";

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

describe("nearFirst", () => {
  const ny = (code: string) => ({ code, tz: "America/New_York" });
  const msy = { code: "MSY", tz: "America/Chicago" };
  const ncl = { code: "NCL", tz: "Europe/London" };
  // An airport the server knows no zone for.
  const old: { code: string; tz?: string } = { code: "OLD" };

  test("the phone's zone first, each group in the server's order (14: New → JFK, EWR, LGA)", () => {
    const server = [ny("JFK"), ny("EWR"), msy, ncl, ny("LGA"), old];
    expect(nearFirst(server, "America/New_York").map((a) => a.code)).toEqual([
      "JFK",
      "EWR",
      "LGA",
      "MSY",
      "NCL",
      "OLD",
    ]);
  });

  test("without a zone the server's order stands, in a new array", () => {
    const server = [msy, ny("JFK")];
    const out = nearFirst(server, null);
    expect(out).toEqual(server);
    expect(out).not.toBe(server);
  });
});

describe("rowCities", () => {
  const row = (code: string, city: string, name: string) => ({ code, city, name });

  test("a second airport of a city says its own name after the city (14)", () => {
    const rows = [
      row("JFK", "New York", "John F. Kennedy International Airport"),
      row("EWR", "Newark", "Newark Liberty International Airport"),
      row("LGA", "New York", "LaGuardia Airport"),
    ];
    expect([...rowCities(rows).values()]).toEqual(["New York", "Newark", "New York LaGuardia"]);
  });

  test("a name that starts with its city stands alone", () => {
    const rows = [row("LHR", "London", "Heathrow Airport"), row("LCY", "London", "London City Airport")];
    expect(rowCities(rows).get("LCY")).toBe("London City");
  });

  test("a name of only the shared words keeps the city", () => {
    const rows = [row("AAA", "Anaa", "Anaa Airport"), row("AAB", "Anaa", "Airport")];
    expect(rowCities(rows).get("AAB")).toBe("Anaa");
  });
});
