import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import {
  aboutFareLines,
  aboutFareNote,
  fareSearchFromParams,
  longDays,
  travelersWords,
  carrierLine,
  closedFareLines,
  comparisonLine,
  departDayLabel,
  factsLine,
  longDay,
  savings,
  shareFareText,
} from "./fare-page-logic";
import { knownCarrier } from "./known-carrier";

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

describe("About this fare, 3.0 (20)", () => {
  const search = { depart: "2026-11-12", return: "2026-11-19", passengers: { adult: 1, child: 0, infant: 0 } };

  it("says what the fare is, as drawn: indicative, round trip as the catalogue sells it, one adult, the route, its days", () => {
    const [first, second] = aboutFareLines({ ...ba, trip: "round_trip", ...search });
    expect(first).toBe(
      "This indicative round-trip fare is for one adult flying from New York (JFK) to London (LHR), November 12–19, 2026. Your specialist confirms availability and the final fare.",
    );
    expect(second).toBe(
      "Travel in Business with British Airways, with a spacious seat and a more comfortable journey. Your specialist confirms the cabin details and arranges the booking by phone.",
    );
  });

  it("names the trip only as the catalogue does, the travelers searched for, and no day the calendar does not have", () => {
    const [first] = aboutFareLines({
      ...ba,
      trip: undefined,
      depart: "2026-02-30",
      return: null,
      passengers: { adult: 2, child: 1, infant: 0 },
    });
    expect(first).toBe(
      "This indicative fare is for 3 travelers flying from New York (JFK) to London (LHR). Your specialist confirms availability and the final fare.",
    );
    const [, second] = aboutFareLines({ ...ba, cabin: "first", trip: "one_way", ...search });
    expect(second).toBe(
      "Travel in First with British Airways. Your specialist confirms the cabin details and arranges the booking by phone.",
    );
    expect(longDay("2028-02-29")).toBe("February 29, 2028");
    expect(longDay(null)).toBeNull();
  });

  it("names no airline for a fare that has none — never `with Unknown`", () => {
    const unknown = { ...ba, carrier: { code: null, name: "Unknown", logoUrl: null } };
    const [, second] = aboutFareLines({ ...unknown, trip: "one_way", ...search });
    expect(second).toBe(
      "Travel in Business, with a spacious seat and a more comfortable journey. Your specialist confirms the cabin details and arranges the booking by phone.",
    );
    expect(aboutFareNote(unknown)).toBe(
      "The published fare was recorded on 16 September. Your specialist will confirm current availability and fare conditions before booking.",
    );
    expect(knownCarrier(unknown.carrier)).toBeNull();
    expect(knownCarrier({ code: null, name: "  " })).toBeNull();
    expect(knownCarrier(ba.carrier)).toEqual(ba.carrier);
    // A code alone names the airline even when the catalogue had no name for it.
    expect(knownCarrier({ code: "BA", name: "Unknown", logoUrl: null })).toEqual({
      code: "BA",
      name: "Unknown",
      logoUrl: null,
    });
  });

  it("writes the days as 20 does, across a month and a year too", () => {
    expect(longDays("2026-11-12", "2026-11-19")).toBe("November 12–19, 2026");
    expect(longDays("2026-10-28", "2026-11-02")).toBe("October 28 – November 2, 2026");
    expect(longDays("2026-12-28", "2027-01-04")).toBe("December 28, 2026 – January 4, 2027");
    expect(longDays("2026-11-12", null)).toBe("November 12, 2026");
    expect(travelersWords({ adult: 2, child: 0, infant: 0 })).toBe("two adults");
  });

  it("reads the search a fare was opened from, and nothing it cannot trust", () => {
    expect(fareSearchFromParams({ depart: "2026-11-12", ret: "2026-11-19", adults: "1" })).toEqual(search);
    expect(fareSearchFromParams({ depart: "2026-13-40", ret: "2026-11-19", adults: "0" })).toEqual({
      depart: null,
      return: null,
      passengers: null,
    });
  });

  it("shares the route, the cabin, the fare with what it buys as the catalogue says, and its link", () => {
    expect(shareFareText({ ...ba, trip: "one_way" })).toBe(
      "New York to London in Business, $4,200 one way, with BuyBusinessClass Club: bbcclub://fare/00000000-0000-4000-8000-00000000fa01",
    );
    // ADR-IMPL-056: a round-trip fare is never shared as one way.
    expect(shareFareText({ ...ba, price: { offer: 3900, currency: "USD" }, trip: "round_trip" })).toBe(
      "New York to London in Business, $3,900 round trip, with BuyBusinessClass Club: bbcclub://fare/00000000-0000-4000-8000-00000000fa01",
    );
    // An older server names no trip: the price is not described as more than is known.
    expect(shareFareText({ ...ba, trip: undefined })).toBe(
      "New York to London in Business, $4,200, with BuyBusinessClass Club: bbcclub://fare/00000000-0000-4000-8000-00000000fa01",
    );
  });
});
