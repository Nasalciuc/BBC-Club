import { describe, expect, it } from "bun:test";
import type { AirportVM, FareVM } from "@bbc/shared/api/v1/fares";

import { searchReducer as reducer, type SearchState } from "./search-logic";

const JFK: AirportVM = {
  code: "JFK",
  city: "New York",
  name: "John F Kennedy",
  countryCode: "US",
  lat: 40.6,
  lng: -73.8,
};
const LIS: AirportVM = {
  code: "LIS",
  city: "Lisbon",
  name: "Humberto Delgado",
  countryCode: "PT",
  lat: 38.8,
  lng: -9.1,
  tz: "Europe/Lisbon",
};
const ESTIMATE = { amount: 2055, currency: "USD", trip: "round_trip", cabin: "business", basis: "formula" } as const;

const START: SearchState = {
  from: JFK,
  to: LIS,
  dates: { depart: null, return: null, flexible: true },
  cabin: "business",
  passengers: { adult: 1, child: 0, infant: 0 },
  results: null,
  estimate: null,
  route: null,
  status: "searching",
  errorMessage: null,
};

describe("search reducer — the estimate and the route", () => {
  it("keeps the estimate and the server's route when the search found no fare", () => {
    const next = reducer(START, { type: "searchDone", results: [], estimate: ESTIMATE, route: { from: JFK, to: LIS } });
    expect(next.status).toBe("empty");
    expect(next.estimate).toEqual(ESTIMATE);
    expect(next.route?.to.tz).toBe("Europe/Lisbon");
  });

  it("never shows an estimate beside published fares", () => {
    const fare = { id: "f1" } as unknown as FareVM;
    const next = reducer(START, {
      type: "searchDone",
      results: [fare],
      estimate: ESTIMATE,
      route: { from: JFK, to: LIS },
    });
    expect(next.status).toBe("done");
    expect(next.estimate).toBeNull();
  });

  it("starts a new route clean and resets the dates to flexible when the route is cleared", () => {
    const found = reducer(START, {
      type: "searchDone",
      results: [],
      estimate: ESTIMATE,
      route: { from: JFK, to: LIS },
    });
    const dated = reducer(found, {
      type: "setDates",
      dates: { depart: "2026-11-03", return: "2026-11-10", flexible: false },
    });
    const next = reducer(dated, { type: "selectDestination", airport: { ...LIS, code: "OPO", city: "Porto" } });
    expect(next).toMatchObject({ results: null, estimate: null, route: null, status: "searching" });
    expect(next.dates.depart).toBe("2026-11-03"); // the dates are the member's, they stay for the next route
    expect(reducer(dated, { type: "clearDestination" }).dates).toEqual({ depart: null, return: null, flexible: true });
  });

  it("takes the profile's usual cabin and travelers only before a route is chosen", () => {
    const fresh = { ...START, to: null, status: "idle" as const };
    const seeded = reducer(fresh, {
      type: "seedPreferences",
      cabin: "first",
      passengers: { adult: 2, child: 0, infant: 0 },
    });
    expect(seeded.cabin).toBe("first");
    expect(seeded.passengers.adult).toBe(2);
    expect(reducer(START, { type: "seedPreferences", cabin: "first" })).toBe(START);
    expect(reducer(fresh, { type: "seedPreferences" })).toMatchObject({ cabin: "business" });
  });

  it("drops the estimate and the route with the destination, and on a failure", () => {
    const found = reducer(START, {
      type: "searchDone",
      results: [],
      estimate: ESTIMATE,
      route: { from: JFK, to: LIS },
    });
    expect(reducer(found, { type: "clearDestination" })).toMatchObject({
      estimate: null,
      route: null,
      to: null,
      status: "idle",
    });
    expect(reducer(found, { type: "searchFailed", message: "x" })).toMatchObject({ estimate: null, status: "error" });
  });
});
