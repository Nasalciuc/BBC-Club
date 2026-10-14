import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import {
  aboutFareNote,
  carrierLine,
  closedFareLines,
  comparisonLine,
  departDayLabel,
  factsLine,
} from "./fare-page-logic";

const ba = fixture.fares[0]!;

describe("the fare page's lines (Figma 135:845)", () => {
  it("names the cabin, not the product, beside the airline", () => {
    expect(carrierLine(ba)).toBe("British Airways · Business · Nonstop");
    expect(carrierLine({ ...ba, nonstop: false, cabin: "first" })).toBe("British Airways · First · One stop");
  });

  it("reads the day, ONE WAY and the time in the air", () => {
    expect(factsLine(ba)).toBe("OCT 12 · ONE WAY · 7H 05M");
    expect(factsLine({ departAt: null, departLocal: null, durationMinutes: null })).toBe("ONE WAY");
  });

  it("takes the departure's day at the airport, whatever the phone's zone", () => {
    // JFK 20:10 on 12 October is 00:10 UTC on the 13th: the day is the airport's.
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10")).toBe("OCT 12");
    // Tokyo 01:30 on 3 November is 16:30 UTC on the 2nd.
    expect(departDayLabel("2026-11-02T16:30:00.000Z", "01:30")).toBe("NOV 3");
    expect(departDayLabel(null, null)).toBeNull();
  });
});

describe("About this fare (Figma 135:847)", () => {
  it("writes the comparison as Figma does", () => {
    expect(comparisonLine(ba.price)).toBe("$7,850 published − $4,200 your fare = $3,650 difference.");
    expect(comparisonLine({ offer: 4200, currency: "USD" })).toBeNull();
  });

  it("says when the published fare was recorded, read from its source", () => {
    expect(aboutFareNote(ba)).toBe(
      "The published British Airways fare was recorded on 16 September. Your specialist will confirm current availability and fare conditions before booking.",
    );
    expect(aboutFareNote({ ...ba, price: { ...ba.price, publishedSource: "Sabre" } })).toBe(
      "Your specialist will confirm current availability and fare conditions before booking.",
    );
  });
});

describe("a closed fare (Figma 135:848)", () => {
  it("names the day, the route by its cities, the airline and cabin", () => {
    expect(
      closedFareLines({
        from: "JFK",
        to: "LHR",
        fromCity: "New York",
        toCity: "London",
        carrier: "British Airways",
        cabin: "business",
        departDate: "2026-10-12",
      }),
    ).toEqual({ day: "OCT 12 · ONE WAY", route: "New York to London", carrier: "British Airways · Business" });
  });

  it("falls back to the codes when the server knows less", () => {
    expect(closedFareLines({ from: "JFK", to: "LHR" })).toEqual({ day: "ONE WAY", route: "JFK → LHR", carrier: null });
  });
});
