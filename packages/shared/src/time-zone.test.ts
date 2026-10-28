import { describe, expect, it } from "bun:test";
import { isIanaZone } from "./time-zone";

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
