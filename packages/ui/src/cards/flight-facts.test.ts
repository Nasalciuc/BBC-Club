import { describe, expect, it } from "bun:test";

import { arriveYmd, cabinText, dayText, departYmd, durationText, fareBasis, flightFacts } from "./flight-facts";

const fare = {
  nonstop: true,
  durationMinutes: 425,
  departAt: "2026-10-12T22:55:00.000Z",
  departLocal: "18:55",
  departDate: "2026-10-12",
  arriveDayOffset: 1,
  cabin: "business" as const,
};

describe("flight facts (sheet 40 · 04)", () => {
  it("writes the time in the air as `7h 05m`", () => {
    expect(durationText(425)).toBe("7h 05m");
    expect(durationText(420)).toBe("7h 00m");
    expect(durationText(null)).toBeNull();
  });

  it("says nonstop or connecting, never a count of stops", () => {
    expect(flightFacts(fare)).toBe("Nonstop · 7h 05m");
    expect(flightFacts({ nonstop: false, durationMinutes: 1100 })).toBe("Connecting · 18h 20m");
    expect(flightFacts({ nonstop: true, durationMinutes: null })).toBe("Nonstop");
  });

  it("names the cabin", () => {
    expect(cabinText("business")).toBe("Business");
    expect(cabinText("first")).toBe("First");
  });

  it("says what the price buys only as the catalogue names it (04, 13)", () => {
    expect(fareBasis("round_trip")).toBe("round trip");
    expect(fareBasis("one_way")).toBe("one way");
    expect(fareBasis(undefined)).toBeNull();
  });
});

describe("days", () => {
  it("writes a day as `Oct 12, 2026`, and nothing for a day the calendar has not", () => {
    expect(dayText("2026-10-12")).toBe("Oct 12, 2026");
    expect(dayText("2026-02-30")).toBeNull();
    expect(dayText(null)).toBeNull();
  });

  it("takes the server's departure day, and the arrival a day later across midnight", () => {
    expect(departYmd(fare)).toBe("2026-10-12");
    expect(arriveYmd(fare)).toBe("2026-10-13");
  });

  it("falls back to the airport's clock — a New York evening stays that evening's day", () => {
    expect(departYmd({ ...fare, departDate: undefined })).toBe("2026-10-12");
    expect(departYmd({ ...fare, departDate: null, departAt: null })).toBeNull();
  });
});
