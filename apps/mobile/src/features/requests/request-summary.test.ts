import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import { priceForTrip, requestSummary } from "./request-summary";

describe("requestSummary — the trip at the top of the request sheet (06)", () => {
  it("reads a fare as 06 draws it: the cities, the cabin, the clocks, the airline, the price and its saving", () => {
    const fare = fixture.fares[0]!;
    expect(
      requestSummary({ fare, from: "JFK", to: "LHR", fromCity: "New York", toCity: "London", cabin: "business" }),
    ).toEqual({
      title: "New York to London",
      cabin: "Business",
      route: "JFK 18:55 → LHR 07:00 +1",
      carrier: { code: "BA", name: "British Airways", logoUrl: null },
      price: { amount: "$4,200", percent: 46, published: "$7,850", source: "Sabre · 16 Sep" },
      trip: null, // the fixture's fare does not say its trip
    });
  });

  it("asks a quote without an airline or a price, its route in codes", () => {
    expect(requestSummary({ from: "JFK", to: "LIS", fromCity: "New York", toCity: "Lisbon", cabin: "first" })).toEqual({
      title: "New York to Lisbon",
      cabin: "First",
      route: "JFK → LIS",
      carrier: null,
      price: null,
      trip: null,
    });
  });

  it("reads the route in codes when a city's name is not known, and a fare without clocks by its codes", () => {
    const fare = {
      ...fixture.fares[0]!,
      departLocal: null,
      arriveLocal: null,
      price: { offer: 4200, currency: "USD" },
    };
    const summary = requestSummary({
      fare,
      from: "JFK",
      to: "LHR",
      fromCity: null,
      toCity: "London",
      cabin: "business",
    });
    expect(summary.title).toBe("JFK → LHR");
    expect(summary.route).toBe("JFK → LHR");
    expect(summary.price).toEqual({ amount: "$4,200", percent: null, published: null, source: null });
  });

  it("names no airline for a fare with none — never `Unknown`, as the server records none (carrierAtRequest)", () => {
    const fare = { ...fixture.fares[0]!, carrier: { code: null, name: "Unknown", logoUrl: null } };
    expect(requestSummary({ fare, from: "JFK", to: "LHR", cabin: "business" }).carrier).toBeNull();
    // An airline named without a code is still an airline.
    const named = { ...fixture.fares[0]!, carrier: { code: null, name: "La Compagnie", logoUrl: null } };
    expect(requestSummary({ fare: named, from: "EWR", to: "ORY", cabin: "business" }).carrier).toEqual({
      code: null,
      name: "La Compagnie",
      logoUrl: null,
    });
  });

  it("neither strikes the published fare nor says the saving without its source on record (ADR-IMPL-081)", () => {
    const fare = { ...fixture.fares[0]!, price: { offer: 4200, published: 7850, currency: "USD" } };
    const summary = requestSummary({ fare, from: "JFK", to: "LHR", cabin: "business" });
    expect(summary.price).toEqual({ amount: "$4,200", percent: null, published: null, source: null });
  });
});

describe("priceForTrip — a fare's price only beside the trip it covers (ADR-IMPL-081)", () => {
  const price = { amount: "$4,200", percent: null, published: null, source: null };

  it("a one-way fare's price for a one-way request; none once a round trip is asked", () => {
    expect(priceForTrip({ price, trip: "one_way" }, "oneway")).toBe(price);
    expect(priceForTrip({ price, trip: "one_way" }, "round")).toBeNull();
  });

  it("a round-trip fare's price for a round trip; none for one way", () => {
    expect(priceForTrip({ price, trip: "round_trip" }, "round")).toBe(price);
    expect(priceForTrip({ price, trip: "round_trip" }, "oneway")).toBeNull();
  });

  it("an offer's price, whose trip is not known, stands for either; no price stays none", () => {
    expect(priceForTrip({ price, trip: null }, "round")).toBe(price);
    expect(priceForTrip({ price, trip: null }, "oneway")).toBe(price);
    expect(priceForTrip({ price: null, trip: "one_way" }, "oneway")).toBeNull();
  });
});
