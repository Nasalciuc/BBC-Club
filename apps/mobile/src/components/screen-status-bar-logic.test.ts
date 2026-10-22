import { describe, expect, it } from "bun:test";

import { heroImageKey, statusBarOn } from "./screen-status-bar-logic";

describe("statusBarOn — the glyphs follow what is drawn under them (F022, F028)", () => {
  it("no photograph: the light tint band takes dark glyphs, never white on `surface-tint` (1.12:1)", () => {
    expect(statusBarOn({ hasImage: false, loaded: false, pastHero: false })).toBe("light");
  });

  it("a photograph still loading, or one that failed, draws only the tint: dark glyphs", () => {
    expect(statusBarOn({ hasImage: true, loaded: false, pastHero: false })).toBe("light");
  });

  it("a photograph drawn under the bar: light glyphs over it", () => {
    expect(statusBarOn({ hasImage: true, loaded: true, pastHero: false })).toBe("dark");
  });

  it("scrolled past the photograph: the page under the bar takes dark glyphs", () => {
    expect(statusBarOn({ hasImage: true, loaded: true, pastHero: true })).toBe("light");
  });
});

describe("heroImageKey — which photograph a load or a failure was for", () => {
  it("a remote one by its address, a bundled one by its asset number, none as null", () => {
    const remote = { uri: "https://example.com/a.jpg", headers: {} };
    expect(heroImageKey(remote)).toBe("https://example.com/a.jpg");
    expect(heroImageKey(12)).toBe("asset:12");
    expect(heroImageKey(null)).toBeNull();
  });
});
