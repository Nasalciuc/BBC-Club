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
  const ny = (code: string) => ({ code, city: "New York", tz: "America/New_York" });
  const msy = { code: "MSY", city: "New Orleans", tz: "America/Chicago" };
  const ncl = { code: "NCL", city: "Newcastle", tz: "Europe/London" };
  // An airport the server knows no zone for (a made-up code).
  const old: { code: string; city: string; tz?: string } = { code: "OLD", city: "Old Town" };

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

  // `Ho` typed in Vietnam: what the server answers (its order), the catalogue's rows (seeds/airports-reference.tsv).
  const hcmc = [
    { code: "HBA", city: "Hobart", tz: "Australia/Hobart" },
    { code: "HKG", city: "Hong Kong", tz: "Asia/Hong_Kong" },
    { code: "SGN", city: "Ho Chi Minh City", tz: "Asia/Ho_Chi_Minh" },
  ];

  test("Ho Chi Minh City first for a phone in Asia/Ho_Chi_Minh (iOS) and in Asia/Saigon (Android's name)", () => {
    expect(nearFirst(hcmc, "Asia/Ho_Chi_Minh").map((a) => a.code)).toEqual(["SGN", "HBA", "HKG"]);
    expect(nearFirst(hcmc, "Asia/Saigon").map((a) => a.code)).toEqual(["SGN", "HBA", "HKG"]);
  });

  test("an airport sent without its zone comes first when its city is the zone's (Ho Chi Minh City)", () => {
    const noZone = hcmc.map(({ code, city }) => ({ code, city }));
    expect(nearFirst(noZone, "Asia/Saigon").map((a) => a.code)).toEqual(["SGN", "HBA", "HKG"]);
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
