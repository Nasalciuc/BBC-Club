import { describe, expect, it } from "bun:test";

import { isTabPath } from "./tab-path";

describe("isTabPath — on a tab, or on a screen pushed over the tabs", () => {
  it("knows the three tabs, with or without a trailing slash", () => {
    expect(isTabPath("/explore")).toBe(true);
    expect(isTabPath("/requests")).toBe(true);
    expect(isTabPath("/profile/")).toBe(true);
  });

  it("reads every other screen as pushed over the tabs", () => {
    expect(isTabPath("/fare/00000000-0000-4000-8000-00000000fa01")).toBe(false);
    expect(isTabPath("/destination/LHR")).toBe(false);
    expect(isTabPath("/request/confirmed")).toBe(false);
    expect(isTabPath("/")).toBe(false);
  });
});
