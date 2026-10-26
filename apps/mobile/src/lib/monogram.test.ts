import { describe, expect, it } from "bun:test";

import { monogram } from "./monogram";

describe("monogram", () => {
  it("takes the initials of two names, the first two letters of one, nothing from none", () => {
    expect(monogram("Alex Morgan")).toBe("AM");
    expect(monogram("  alex   morgan  ")).toBe("AM");
    expect(monogram("Alex")).toBe("AL");
    expect(monogram("")).toBe("");
    expect(monogram(null)).toBe("");
    expect(monogram(undefined)).toBe("");
  });
});
