import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import { requestSummary } from "./request-summary";

describe("requestSummary — the request sheet's three lines (Figma 135:849)", () => {
  it("reads a fare as Figma draws it", () => {
    const fare = fixture.fares[0]!;
    expect(
      requestSummary({ fare, from: "JFK", to: "LHR", fromCity: "New York", toCity: "London", cabin: "business" }),
    ).toEqual({
      title: "New York to London",
      facts: "JFK → LHR · British Airways · Business",
      price: "$4,200 per traveler",
    });
  });

  it("asks a quote without an airline or a price", () => {
    expect(requestSummary({ from: "JFK", to: "LIS", fromCity: "New York", toCity: "Lisbon", cabin: "first" })).toEqual({
      title: "New York to Lisbon",
      facts: "JFK → LIS · First",
      price: null,
    });
  });

  it("reads the route in codes when a city's name is not known", () => {
    expect(requestSummary({ from: "JFK", to: "LHR", fromCity: null, toCity: "London", cabin: "business" }).title).toBe(
      "JFK → LHR",
    );
  });
});
