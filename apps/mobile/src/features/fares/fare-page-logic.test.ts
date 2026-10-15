import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import {
  aboutFareNote,
  carrierLine,
  closedFareLines,
  comparisonLine,
  departDayLabel,
  factsLine,
  savings,
} from "./fare-page-logic";

const ba = fixture.fares[0]!;

describe("the fare page's lines (Figma 135:845)", () => {
  it("names the cabin, not the product, beside the airline — a connecting fare counts no stops", () => {
    expect(carrierLine(ba)).toBe("British Airways · Business · Nonstop");
    expect(carrierLine({ ...ba, nonstop: false, cabin: "first" })).toBe("British Airways · First · Connecting");
  });

  it("reads the day, ONE WAY and the time in the air", () => {
    expect(factsLine(ba)).toBe("OCT 12 · ONE WAY · 7H 05M");
    expect(factsLine({ ...ba, departDate: "2026-10-12" })).toBe("OCT 12 · ONE WAY · 7H 05M");
    expect(factsLine({ departAt: null, departLocal: null, durationMinutes: null })).toBe("ONE WAY");
  });

  it("prints the day the server named at the origin airport, whatever the phone's zone", () => {
    // Auckland in its summer is UTC+13: 01:30 on 13 October is 12:30 UTC on the 12th — a clock UTC−11 shares.
    expect(departDayLabel("2026-10-12T12:30:00.000Z", "01:30", "2026-10-13")).toBe("OCT 13");
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2026-10-12")).toBe("OCT 12");
  });

  it("a day the calendar does not have falls through to the instant and the clock", () => {
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2026-13-01")).toBe("OCT 12");
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2026-00-01")).toBe("OCT 12");
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2026-10-00")).toBe("OCT 12");
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2026-10-32")).toBe("OCT 12");
    expect(departDayLabel(null, null, "2026-13-01")).toBeNull();
  });

  it("a month's own length decides, February's 29th only in a leap year", () => {
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2026-02-30")).toBe("OCT 12");
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2026-04-31")).toBe("OCT 12");
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10", "2027-02-29")).toBe("OCT 12");
    expect(departDayLabel(null, null, "2026-02-30")).toBeNull();
    expect(departDayLabel(null, null, "2028-02-29")).toBe("FEB 29");
    expect(departDayLabel(null, null, "2026-12-31")).toBe("DEC 31");
  });

  it("without the server's day, reads it from the instant and the airport's clock", () => {
    // JFK 20:10 on 12 October is 00:10 UTC on the 13th: the day is the airport's.
    expect(departDayLabel("2026-10-13T00:10:00.000Z", "20:10")).toBe("OCT 12");
    // Tokyo 01:30 on 3 November is 16:30 UTC on the 2nd.
    expect(departDayLabel("2026-11-02T16:30:00.000Z", "01:30")).toBe("NOV 3");
    expect(departDayLabel(null, null)).toBeNull();
    expect(departDayLabel(null, null, null)).toBeNull();
  });
});

describe("About this fare (Figma 135:847)", () => {
  it("writes the comparison as Figma does", () => {
    expect(comparisonLine(ba.price)).toBe("$7,850 published − $4,200 your fare = $3,650 difference.");
    expect(comparisonLine({ offer: 4200, currency: "USD" })).toBeNull();
  });

  it("keeps the sum true to the prices as printed, cents and all", () => {
    const price = { offer: 1000.5, published: 5000.49, currency: "USD" };
    expect(savings(price)).toBe(3999);
    expect(comparisonLine(price)).toBe("$5,000 published − $1,001 your fare = $3,999 difference.");
    expect(savings({ offer: 4200, currency: "USD" })).toBeNull();
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

  it("names no day the calendar does not have", () => {
    expect(closedFareLines({ from: "JFK", to: "LHR", departDate: "2026-02-30" }).day).toBe("ONE WAY");
    expect(closedFareLines({ from: "JFK", to: "LHR", departDate: "2028-02-29" }).day).toBe("FEB 29 · ONE WAY");
  });
});
