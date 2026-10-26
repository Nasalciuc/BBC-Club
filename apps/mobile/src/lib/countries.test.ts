import { describe, expect, it } from "bun:test";

import { countryName } from "./countries";

describe("countryName", () => {
  it("names the countries the images show (02, 04, 13)", () => {
    expect(countryName("FR")).toBe("France");
    expect(countryName("JP")).toBe("Japan");
    expect(countryName("AE")).toBe("UAE");
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName("US")).toBe("United States");
  });

  it("reads a code in any case", () => {
    expect(countryName("it")).toBe("Italy");
  });

  it("leaves out what it does not know, never a guess", () => {
    expect(countryName("ZZ")).toBeNull();
    expect(countryName("")).toBeNull();
    expect(countryName(null)).toBeNull();
  });

  it("has every ISO 3166-1 country once", () => {
    const seen = new Set<string>();
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const name = countryName(String.fromCharCode(a, b));
        if (name) seen.add(name);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(249);
  });
});
