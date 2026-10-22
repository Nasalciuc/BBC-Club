import { describe, expect, test } from "bun:test";
import {
  compareSemver,
  gateFor,
  gateRetryDelayMs,
  maintenanceBody,
  maintenanceValue,
  shouldRecheck,
} from "./app-gate-logic";

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

describe("shouldRecheck — the gate asks again, not once per process (F033)", () => {
  const t0 = Date.parse("2026-10-22T10:00:00Z");

  test("after a failure: again at 5 s, 30 s, 2 min — then on the next return to the app", () => {
    const failed = (attempts: number) => ({ lastOkAt: null, lastFailedAt: t0, attempts });
    expect(shouldRecheck({ ...failed(1), now: t0 + 5_000, trigger: "retry" })).toBe(true);
    expect(shouldRecheck({ ...failed(1), now: t0 + 4_999, trigger: "retry" })).toBe(false);
    expect(shouldRecheck({ ...failed(2), now: t0 + 29_999, trigger: "retry" })).toBe(false);
    expect(shouldRecheck({ ...failed(2), now: t0 + 30_000, trigger: "retry" })).toBe(true);
    expect(shouldRecheck({ ...failed(3), now: t0 + 120_000, trigger: "retry" })).toBe(true);
    // Past the third: no timer of its own; the next return to the app asks.
    expect(shouldRecheck({ ...failed(4), now: t0 + 3_600_000, trigger: "retry" })).toBe(false);
    expect(shouldRecheck({ ...failed(4), now: t0 + 1_000, trigger: "foreground" })).toBe(true);
    expect(gateRetryDelayMs(1)).toBe(5_000);
    expect(gateRetryDelayMs(2)).toBe(30_000);
    expect(gateRetryDelayMs(3)).toBe(120_000);
    expect(gateRetryDelayMs(4)).toBeNull();
  });

  test("after an answer: a return to the app asks again once five minutes have passed", () => {
    const ok = { lastOkAt: t0, lastFailedAt: null, attempts: 0 };
    expect(shouldRecheck({ ...ok, now: t0 + 60_000, trigger: "foreground" })).toBe(false);
    expect(shouldRecheck({ ...ok, now: t0 + 6 * 60_000, trigger: "foreground" })).toBe(true);
    // An answer leaves no retry waiting.
    expect(shouldRecheck({ ...ok, now: t0 + 6 * 60_000, trigger: "retry" })).toBe(false);
    // An answer, then a failure: the failure decides.
    const okThenFailed = { lastOkAt: t0, lastFailedAt: t0 + 60_000, attempts: 1 };
    expect(shouldRecheck({ ...okThenFailed, now: t0 + 65_000, trigger: "retry" })).toBe(true);
    expect(shouldRecheck({ ...okThenFailed, now: t0 + 61_000, trigger: "foreground" })).toBe(true);
  });

  test("not asked yet: a return to the app asks", () => {
    expect(shouldRecheck({ lastOkAt: null, lastFailedAt: null, attempts: 0, now: t0, trigger: "foreground" })).toBe(
      true,
    );
  });
});

describe("gateFor — what an answer makes of the app", () => {
  test("older than the oldest supported: update; else maintenance; else open", () => {
    const config = { minSupportedVersion: "0.3.0", maintenance: null };
    expect(gateFor(config, "0.2.0")?.kind).toBe("update");
    expect(gateFor({ ...config, maintenance: "Back soon." }, "0.3.0")).toEqual({
      kind: "maintenance",
      value: "Back soon.",
    });
    expect(gateFor(config, "0.3.0")).toBeNull();
  });
});
