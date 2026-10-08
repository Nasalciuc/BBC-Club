import { describe, expect, it } from "bun:test";

import {
  cabinLabel,
  datesChipLabel,
  noFareCopy,
  preferencesLines,
  searchWhen,
  travelersLabel,
} from "./travel-preferences";

const OCT_8 = new Date(2026, 9, 8, 10, 0, 0);
const FLEXIBLE = { depart: null, return: null, flexible: true };

describe("datesChipLabel", () => {
  it("reads the current month and flexible while no date is chosen (Figma `Oct · flexible`)", () => {
    expect(datesChipLabel(FLEXIBLE, OCT_8)).toBe("Oct · flexible");
    expect(datesChipLabel(FLEXIBLE, new Date(2026, 0, 3))).toBe("Jan · flexible");
  });

  it("reads the chosen dates — one month once, two months twice, one way alone", () => {
    expect(datesChipLabel({ depart: "2026-10-12", return: "2026-10-19", flexible: false }, OCT_8)).toBe("Oct 12 – 19");
    expect(datesChipLabel({ depart: "2026-10-28", return: "2026-11-02", flexible: false }, OCT_8)).toBe(
      "Oct 28 – Nov 2",
    );
    expect(datesChipLabel({ depart: "2026-10-12", return: null, flexible: false }, OCT_8)).toBe("Oct 12");
  });
});

describe("cabin and travelers", () => {
  it("names the cabin and counts every traveler, singular at one", () => {
    expect(cabinLabel("business")).toBe("Business");
    expect(cabinLabel("first")).toBe("First");
    expect(travelersLabel({ adult: 1, child: 0, infant: 0 })).toBe("1 traveler");
    expect(travelersLabel({ adult: 2, child: 0, infant: 0 })).toBe("2 travelers");
    expect(travelersLabel({ adult: 1, child: 1, infant: 1 })).toBe("3 travelers");
  });
});

describe("preferencesLines", () => {
  it("writes the two mono lines of 89:390", () => {
    expect(preferencesLines(FLEXIBLE, "business", { adult: 1, child: 0, infant: 0 }, OCT_8)).toEqual([
      "OCT · FLEXIBLE   ·   BUSINESS",
      "1 TRAVELER",
    ]);
  });
});

describe("searchWhen", () => {
  it("sends no date while flexible — the estimate exists only for an undated search", () => {
    expect(searchWhen(FLEXIBLE)).toBeUndefined();
  });

  it("sends noon UTC of the departure day", () => {
    expect(searchWhen({ depart: "2026-10-12", return: "2026-10-19", flexible: false })).toBe(
      "2026-10-12T12:00:00.000Z",
    );
  });
});

describe("noFareCopy", () => {
  const JFK = { city: "New York", countryCode: "US" };
  const RMO = { city: "Chișinău", countryCode: "MD" };
  const LHR = { countryCode: "GB" };

  it("says no fares right now when the route touches North America (89:390)", () => {
    expect(noFareCopy(JFK, LHR).kind).toBe("no_fare_now");
    expect(noFareCopy(RMO, { countryCode: "US" }).kind).toBe("no_fare_now");
    expect(noFareCopy(JFK, LHR).title).toBe("Let us find your fare.");
  });

  it("says fares are on request, naming the origin, when it does not (536:11155)", () => {
    const copy = noFareCopy(RMO, LHR);
    expect(copy.kind).toBe("on_request");
    expect(copy.title).toBe("Fares from Chișinău are on request.");
    expect(copy.body).toBe(
      "We publish fares from North America for now. Tell us where you're going — your specialist will find the fare.",
    );
  });

  it("falls back to no fares right now without an origin", () => {
    expect(noFareCopy(null, LHR).kind).toBe("no_fare_now");
  });
});
