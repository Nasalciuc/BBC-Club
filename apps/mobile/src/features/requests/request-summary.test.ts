import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import { requestSummary } from "./request-summary";

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
    });
  });

  it("asks a quote without an airline or a price, its route in codes", () => {
    expect(requestSummary({ from: "JFK", to: "LIS", fromCity: "New York", toCity: "Lisbon", cabin: "first" })).toEqual({
      title: "New York to Lisbon",
      cabin: "First",
      route: "JFK → LIS",
      carrier: null,
      price: null,
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

  it("strikes the published fare only with its source on record", () => {
    const fare = { ...fixture.fares[0]!, price: { offer: 4200, published: 7850, currency: "USD" } };
    const summary = requestSummary({ fare, from: "JFK", to: "LHR", cabin: "business" });
    expect(summary.price).toEqual({ amount: "$4,200", percent: 46, published: null, source: null });
  });
});
