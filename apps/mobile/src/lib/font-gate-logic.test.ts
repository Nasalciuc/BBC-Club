/** The cold start's font gate (lib/font-gate-logic.ts, ADR-IMPL-072). */
import { describe, expect, it } from "bun:test";
import { FONT_WAIT_CAP_MS, fontGateOpen, fontGateReason, type FontGateInput } from "./font-gate-logic";

const waiting: FontGateInput = { fontsLoaded: false, fontError: null, capPassed: false };

describe("fontGateOpen — the screens draw once the fonts are in, a font failed, or the cap passed", () => {
  it("waits while the fonts are on their way and the cap has not passed", () => {
    expect(fontGateOpen(waiting)).toBe(false);
    expect(fontGateReason(waiting)).toBeNull();
  });

  it("opens with the fonts in", () => {
    expect(fontGateOpen({ ...waiting, fontsLoaded: true })).toBe(true);
    expect(fontGateReason({ ...waiting, fontsLoaded: true })).toBe("fonts");
  });

  it("opens on a font error: the app goes on in the system font", () => {
    const failed = { ...waiting, fontError: new Error("font file unreadable") };
    expect(fontGateOpen(failed)).toBe(true);
    expect(fontGateReason(failed)).toBe("error");
  });

  it("opens at the cap: a slow load never keeps the splash up", () => {
    expect(fontGateOpen({ ...waiting, capPassed: true })).toBe(true);
    expect(fontGateReason({ ...waiting, capPassed: true })).toBe("cap");
  });

  it("counts the fonts first when they arrive with the cap or an error", () => {
    expect(fontGateReason({ fontsLoaded: true, fontError: new Error("late"), capPassed: true })).toBe("fonts");
    expect(fontGateReason({ fontsLoaded: false, fontError: new Error("late"), capPassed: true })).toBe("error");
  });

  it("reads nothing but the fonts and the cap: a session still pending, or none, changes nothing", () => {
    // What the root layout also has at a cold start; the gate must not wait for it (f26870c: get-session has no
    // timeout, and waiting for it was the 23 Sep white screen).
    const withSession = (session: unknown) => ({ ...waiting, capPassed: true, session, sessionPending: true });
    expect(fontGateOpen(withSession(null))).toBe(true);
    expect(fontGateOpen(withSession(undefined))).toBe(true);
    expect(fontGateOpen({ ...waiting, session: { user: { id: "m1" } }, sessionPending: false } as FontGateInput)).toBe(
      false,
    );
  });
});

describe("FONT_WAIT_CAP_MS", () => {
  it("is a few seconds: long enough for a slow phone's first load, short enough that the splash never hangs", () => {
    expect(FONT_WAIT_CAP_MS).toBeGreaterThanOrEqual(2000);
    expect(FONT_WAIT_CAP_MS).toBeLessThanOrEqual(5000);
  });
});
