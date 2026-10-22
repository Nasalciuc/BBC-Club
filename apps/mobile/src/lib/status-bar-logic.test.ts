import { describe, expect, it } from "bun:test";

import { statusBarOn } from "./status-bar-logic";

describe("statusBarOn — the glyphs follow what is under them (ADR-IMPL-047, F028)", () => {
  it("an empty photo slot (loading, an error, no picture) is light: dark glyphs, never white on the tint", () => {
    expect(statusBarOn({ hasImage: false, pastHero: false })).toBe("light");
  });

  it("a photograph under the bar is dark: white glyphs", () => {
    expect(statusBarOn({ hasImage: true, pastHero: false })).toBe("dark");
  });

  it("scrolled past the photograph, the page under the bar is light again", () => {
    expect(statusBarOn({ hasImage: true, pastHero: true })).toBe("light");
    expect(statusBarOn({ hasImage: false, pastHero: true })).toBe("light");
  });
});
