import { describe, expect, test } from "bun:test";
import {
  compareSemver,
  gateFor,
  gateRetryDelayMs,
  maintenanceBody,
  maintenanceValue,
  openFirst,
  shouldRecheck,
  storeUrlValue,
  updateTarget,
  updateTargets,
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
    expect(gateFor(config, "0.2.0", "ios")?.kind).toBe("update");
    expect(gateFor({ ...config, maintenance: "Back soon." }, "0.3.0", "ios")).toEqual({
      kind: "maintenance",
      value: "Back soon.",
    });
    expect(gateFor(config, "0.3.0", "ios")).toBeNull();
  });
});

describe("updateTarget — `Update app` opens the store that holds the update (F039)", () => {
  const WEBSITE = "https://buybusinessclass.com";

  test("the platform's store listing when the server names one; the website otherwise", () => {
    expect(updateTarget({ storeUrl: { ios: "itms-apps://apps.apple.com/app/id1" } }, "ios")).toBe(
      "itms-apps://apps.apple.com/app/id1",
    );
    expect(updateTarget({ storeUrl: { android: "market://details?id=com.bbc.club" } }, "android")).toBe(
      "market://details?id=com.bbc.club",
    );
    expect(updateTarget({ storeUrl: { ios: "itms-apps://apps.apple.com/app/id1" } }, "android")).toBe(WEBSITE);
    expect(updateTarget({}, "ios")).toBe(WEBSITE);
    expect(updateTarget({ storeUrl: {} }, "web")).toBe(WEBSITE);
  });

  test("a store link the phone cannot open falls back to the store's web page, then the website", () => {
    expect(updateTargets({ storeUrl: { ios: "itms-apps://apps.apple.com/app/id1" } }, "ios")).toEqual([
      "itms-apps://apps.apple.com/app/id1",
      "https://apps.apple.com/app/id1",
      WEBSITE,
    ]);
    expect(updateTargets({ storeUrl: { android: "market://details?id=com.bbc.club" } }, "android")).toEqual([
      "market://details?id=com.bbc.club",
      "https://play.google.com/store/apps/details?id=com.bbc.club",
      WEBSITE,
    ]);
    const https = "https://play.google.com/store/apps/details?id=com.bbc.club";
    expect(updateTargets({ storeUrl: { android: https } }, "android")).toEqual([https, WEBSITE]);
  });

  test("only a store or https link is taken from the server: anything else is no store link", () => {
    expect(storeUrlValue({ ios: "javascript:alert(1)", android: "http://example.com" })).toEqual({});
    expect(storeUrlValue({ ios: "  itms-apps://apps.apple.com/app/id1 ", android: 7 })).toEqual({
      ios: "itms-apps://apps.apple.com/app/id1",
    });
    expect(storeUrlValue("itms-apps://apps.apple.com/app/id1")).toEqual({});
    expect(storeUrlValue(null)).toEqual({});
  });

  test("an older app's update page carries the links to try", () => {
    const config = {
      minSupportedVersion: "0.3.0",
      maintenance: null,
      storeUrl: { ios: "itms-apps://apps.apple.com/app/id1" },
    };
    expect(gateFor(config, "0.2.0", "ios")).toEqual({
      kind: "update",
      targets: ["itms-apps://apps.apple.com/app/id1", "https://apps.apple.com/app/id1", WEBSITE],
    });
    expect(gateFor({ minSupportedVersion: "0.3.0", maintenance: null }, "0.2.0", "android")).toEqual({
      kind: "update",
      targets: [WEBSITE],
    });
  });

  test("each link is tried in turn until one opens; none opening throws nothing at the page", async () => {
    const tried: string[] = [];
    const open = async (url: string) => {
      tried.push(url);
      if (!url.startsWith("https://apps.apple.com")) throw new Error("cannot open");
    };
    await openFirst(["itms-apps://apps.apple.com/app/id1", "https://apps.apple.com/app/id1", WEBSITE], open);
    expect(tried).toEqual(["itms-apps://apps.apple.com/app/id1", "https://apps.apple.com/app/id1"]);
    await openFirst(["market://details?id=x"], async () => {
      throw new Error("no");
    });
  });
});
