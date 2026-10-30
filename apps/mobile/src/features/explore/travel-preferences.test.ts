import { describe, expect, it } from "bun:test";

import {
  datesShortLabel,
  cabinLabel,
  datesChipLabel,
  flightOptionsTitle,
  noFareCopy,
  searchWhen,
  travelersLabel,
  withAdults,
} from "./travel-preferences";

const FLEXIBLE = { depart: null, return: null, flexible: true };

describe("flightOptionsTitle", () => {
  it("says option over one fare (13) and options over several (04)", () => {
    expect(flightOptionsTitle(1)).toBe("Flight option");
    expect(flightOptionsTitle(3)).toBe("Flight options");
  });
});

describe("datesChipLabel", () => {
  it("says flexible while no date is chosen", () => {
    expect(datesChipLabel(FLEXIBLE)).toBe("Flexible dates");
  });

  it("reads the chosen dates with their year, as 13 writes them", () => {
    expect(datesChipLabel({ depart: "2026-11-12", return: "2026-11-19" })).toBe("Nov 12 – 19, 2026");
    expect(datesChipLabel({ depart: "2026-10-28", return: "2026-11-02" })).toBe("Oct 28 – Nov 2, 2026");
    expect(datesChipLabel({ depart: "2026-12-28", return: "2027-01-04" })).toBe("Dec 28, 2026 – Jan 4, 2027");
    expect(datesChipLabel({ depart: "2026-11-12", return: null })).toBe("Nov 12, 2026");
  });
});

describe("cabin and travelers", () => {
  it("names the cabin, and counts adults as 13 does — everyone once children travel", () => {
    expect(cabinLabel("business")).toBe("Business");
    expect(cabinLabel("first")).toBe("First");
    expect(travelersLabel({ adult: 1, child: 0, infant: 0 })).toBe("1 adult");
    expect(travelersLabel({ adult: 2, child: 0, infant: 0 })).toBe("2 adults");
    expect(travelersLabel({ adult: 1, child: 1, infant: 1 })).toBe("3 travelers");
  });

  it("changes the adults and keeps the children and infants already in the party", () => {
    const family = { adult: 2, child: 1, infant: 1 };
    expect(withAdults(family, 3)).toEqual({ adult: 3, child: 1, infant: 1 });
    expect(travelersLabel(withAdults(family, 1))).toBe("3 travelers");
    expect(withAdults(family, 0).adult).toBe(1);
    expect(withAdults(undefined, 2)).toEqual({ adult: 2, child: 0, infant: 0 });
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
      "We publish fares from North America for now. Tell us where you're going — your agent will find the fare.",
    );
  });

  it("falls back to no fares right now without an origin", () => {
    expect(noFareCopy(null, LHR).kind).toBe("no_fare_now");
  });
});

describe("datesShortLabel (05)", () => {
  it("writes the chip's days without the year", () => {
    expect(datesShortLabel({ depart: "2026-11-12", return: "2026-11-19" })).toBe("Nov 12–19");
    expect(datesShortLabel({ depart: "2026-10-28", return: "2026-11-02" })).toBe("Oct 28–Nov 2");
    expect(datesShortLabel({ depart: "2026-11-12", return: null })).toBe("Nov 12");
    expect(datesShortLabel({ depart: null, return: null })).toBeNull();
  });
});
