import { describe, expect, it } from "bun:test";
import { isIanaZone, zoneDayBounds } from "./time-zone";

describe("isIanaZone", () => {
  it("takes the zones the club's clocks can read", () => {
    for (const tz of [
      "Asia/Tokyo",
      "UTC",
      "Europe/London",
      "America/New_York",
      "America/Argentina/Buenos_Aires",
      "America/Port-au-Prince",
      "Etc/GMT+5",
    ]) {
      expect(isIanaZone(tz)).toBe(true);
    }
  });

  it("refuses anything Intl would throw on, and offsets that are not names", () => {
    for (const tz of ["", " ", "Not/AZone", "Local", "Z", "GMT+5", "America/New_York\u0000", "X".repeat(80)]) {
      expect(isIanaZone(tz)).toBe(false);
    }
    // Some engines take "+05:00" as a zone and Hermes may not: a name only, so the app and the server agree.
    for (const tz of ["+05:00", "-0330", " Asia/Tokyo"]) {
      expect(isIanaZone(tz)).toBe(false);
    }
  });
});

describe("zoneDayBounds, remembered (ADR-IMPL-077, T2)", () => {
  const ymd = (i: number) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);

  it("a day asked again: the same bounds, in Dates of its own", () => {
    const first = zoneDayBounds("2026-11-01", "America/New_York");
    const kept = { start: first.start.getTime(), end: first.end.getTime() };
    first.start.setTime(0); // a caller's Date is its own: changing it changes nothing remembered
    const again = zoneDayBounds("2026-11-01", "America/New_York");
    expect([again.start.getTime(), again.end.getTime()]).toEqual([kept.start, kept.end]);
    expect(again.end.getTime() - again.start.getTime()).toBe(25 * 3_600_000); // the day the clocks go back
  });

  it("past a thousand days the oldest is forgotten, and asked again it is the same day", () => {
    const before = zoneDayBounds("2026-03-29", "Europe/London");
    for (let i = 0; i < 1_100; i++) zoneDayBounds(ymd(i), "UTC");
    const after = zoneDayBounds("2026-03-29", "Europe/London");
    expect([after.start.toISOString(), after.end.toISOString()]).toEqual([
      before.start.toISOString(),
      before.end.toISOString(),
    ]);
    expect(zoneDayBounds(ymd(1_099), "UTC").start.toISOString()).toBe(`${ymd(1_099)}T00:00:00.000Z`);
  });
});
