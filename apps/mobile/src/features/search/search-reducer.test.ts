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
  chosen: { cabin: false, passengers: false },
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

  it("takes the profile's usual cabin and travelers, a route already chosen included", () => {
    const fresh = { ...START, to: null, status: "idle" as const };
    const usual = { type: "seedPreferences", cabin: "first", passengers: { adult: 2, child: 0, infant: 0 } } as const;
    const seeded = reducer(fresh, usual);
    expect(seeded.cabin).toBe("first");
    expect(seeded.passengers.adult).toBe(2);
    // A destination's page selects the city before the profile arrives (04): its usual cabin still applies.
    expect(reducer(START, usual)).toMatchObject({ cabin: "first", passengers: { adult: 2 } });
    expect(reducer(fresh, { type: "seedPreferences" })).toBe(fresh);
  });

  it("never replaces a cabin or travelers the member chose on a chip", () => {
    const picked = reducer(reducer(START, { type: "setCabin", cabin: "business" }), {
      type: "setPassengers",
      passengers: { adult: 3, child: 0, infant: 0 },
    });
    const seeded = reducer(picked, {
      type: "seedPreferences",
      cabin: "first",
      passengers: { adult: 1, child: 0, infant: 0 },
    });
    expect(seeded).toBe(picked);
    const cabinOnly = reducer(reducer(START, { type: "setCabin", cabin: "business" }), {
      type: "seedPreferences",
      cabin: "first",
      passengers: { adult: 2, child: 0, infant: 0 },
    });
    expect(cabinOnly).toMatchObject({ cabin: "business", passengers: { adult: 2 } });
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
