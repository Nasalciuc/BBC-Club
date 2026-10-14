import { describe, expect, test } from "bun:test";
import { compareSemver, maintenanceBody, maintenanceValue } from "./app-gate-logic";

describe("compareSemver", () => {
  test("compares part by part, as numbers", () => {
    expect(compareSemver("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareSemver("0.2.0", "0.2.0")).toBe(0);
    expect(compareSemver("0.1", "0.1.1")).toBeLessThan(0);
  });
});

describe("maintenance", () => {
  test("only a non-blank string is maintenance — an object never reaches the screen", () => {
    expect(maintenanceValue("2026-10-14T06:00:00Z")).toBe("2026-10-14T06:00:00Z");
    expect(maintenanceValue("  Back after the upgrade.  ")).toBe("Back after the upgrade.");
    expect(maintenanceValue({ until: "2026-10-14T06:00:00Z" })).toBeNull();
    expect(maintenanceValue("   ")).toBeNull();
    expect(maintenanceValue(null)).toBeNull();
  });

  test("a moment today is the time to come back, in the member's time (Figma 240:5163)", () => {
    const now = new Date("2026-10-14T01:00:00-04:00");
    expect(
      maintenanceBody("2026-10-14T06:00:00Z", now, { locale: "en-US", timeZone: "America/New_York" }).replace(
        /\u202f/g,
        " ",
      ),
    ).toBe("We’re making a few improvements. Please check back at 2:00 AM your time.");
  });

  test("a moment on another day names the day", () => {
    const now = new Date("2026-10-13T09:00:00-04:00");
    expect(
      maintenanceBody("2026-10-14T06:00:00Z", now, { locale: "en-US", timeZone: "America/New_York" }).replace(
        /\u202f/g,
        " ",
      ),
    ).toBe("We’re making a few improvements. Please check back at Wed, Oct 14, 2:00 AM your time.");
  });

  test("any other words are the operator's message, as written", () => {
    expect(maintenanceBody("Back after the upgrade.")).toBe("Back after the upgrade.");
    expect(maintenanceBody("1")).toBe("1");
  });
});
