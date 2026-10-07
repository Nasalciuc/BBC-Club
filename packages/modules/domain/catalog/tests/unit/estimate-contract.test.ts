/**
 * The search contract both ways (ADR-IMPL-037): an app built before estimates must parse a response that has them, and
 * an app built with them must parse a response from a server that predates them (an OTA can land before a deploy).
 */
import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { AirportVM, EstimateVM, SearchResultVM } from "@bbc/shared/api/v1/fares";

// Today's shapes, frozen as the 0.1.0 and 0.2.0 apps carry them.
const AirportVM0 = z.object({
  code: z.string().length(3),
  city: z.string(),
  name: z.string(),
  countryCode: z.string().length(2),
  lat: z.number(),
  lng: z.number(),
});
const SearchResultVM0 = z.object({ from: AirportVM0, to: AirportVM0, items: z.array(z.unknown()), offer: z.null() });

const jfk = {
  code: "JFK",
  city: "New York",
  name: "John F Kennedy International",
  countryCode: "US",
  lat: 40.64,
  lng: -73.78,
};
const zrh = { code: "ZRH", city: "Zurich", name: "Zurich Airport", countryCode: "CH", lat: 47.46, lng: 8.55 };
const estimate = { amount: 1633, currency: "USD", trip: "round_trip", cabin: "business", basis: "formula" } as const;

describe("search contract — both upgrade orders", () => {
  it("an app built before estimates parses a response that has them (and drops them)", () => {
    const parsed = SearchResultVM0.parse({
      from: { ...jfk, tz: "America/New_York" },
      to: { ...zrh, tz: "Europe/Zurich" },
      items: [],
      offer: null,
      estimate,
    });
    expect(parsed).not.toHaveProperty("estimate");
    expect(parsed.from).not.toHaveProperty("tz");
  });

  it("an app built with estimates parses a response from a server that predates them", () => {
    const parsed = SearchResultVM.parse({ from: jfk, to: zrh, items: [], offer: null });
    expect(parsed.estimate).toBeUndefined();
    expect(AirportVM.parse(jfk).tz).toBeUndefined();
  });

  it("accepts only the formula's own literals — anything else fails instead of reaching the screen", () => {
    expect(EstimateVM.parse(estimate)).toEqual(estimate);
    expect(() => EstimateVM.parse({ ...estimate, currency: "EUR" })).toThrow();
    expect(() => EstimateVM.parse({ ...estimate, trip: "one_way" })).toThrow();
    expect(() => EstimateVM.parse({ ...estimate, basis: "fare" })).toThrow();
    expect(() => EstimateVM.parse({ ...estimate, amount: 0 })).toThrow();
  });

  it("a search whose estimate this app does not understand still parses — the estimate becomes null", () => {
    for (const odd of [{ ...estimate, trip: "one_way" }, { ...estimate, currency: "EUR" }, { amount: "1633" }, 42]) {
      const parsed = SearchResultVM.parse({ from: jfk, to: zrh, items: [], offer: null, estimate: odd });
      expect(parsed.estimate).toBeNull();
      expect(parsed.items).toEqual([]);
    }
  });

  it("a time zone the app cannot format in never breaks an airport — it becomes undefined", () => {
    for (const odd of [7, "", "not/a_zone", "UTC+3", " Europe/Paris"]) {
      expect(AirportVM.parse({ ...jfk, tz: odd }).tz).toBeUndefined();
    }
    for (const tz of ["America/New_York", "Europe/Chisinau", "UTC"])
      expect(AirportVM.parse({ ...jfk, tz }).tz).toBe(tz);
    const search = SearchResultVM.parse({ from: { ...jfk, tz: "" }, to: zrh, items: [], offer: null, estimate });
    expect(search.from.tz).toBeUndefined();
    expect(search.estimate).toEqual(estimate); // the rest of the search is untouched
  });
});
