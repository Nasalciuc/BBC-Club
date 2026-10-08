import { describe, expect, it } from "bun:test";

import { SAME_METRO_KM, distanceKm, estimateFare, formulaPrice } from "../../src/pricing/estimate";
import {
  readStoredRules,
  rulesFingerprint,
  rulesProblems,
  storedPricingRules,
  type PricingRules,
} from "../../src/pricing/rules";
import { FIXTURE_RULES as R } from "./pricing-rules.fixture";

const at = (code: string, countryCode: string) => ({ code, countryCode });
const JFK = at("JFK", "US");
const ZRH = at("ZRH", "CH");
/** Every continent, the Hawaii and Istanbul cases, Mexico and the Caribbean, and countries without a price. */
const SPREAD = [
  ["JFK", "US"],
  ["LAX", "US"],
  ["BOS", "US"],
  ["HNL", "US"],
  ["OGG", "US"],
  ["YYZ", "CA"],
  ["MEX", "MX"],
  ["SJU", "PR"],
  ["LHR", "GB"],
  ["ZRH", "CH"],
  ["IST", "TR"],
  ["NRT", "JP"],
  ["DXB", "AE"],
  ["TLV", "IL"],
  ["SYD", "AU"],
  ["GRU", "BR"],
  ["JNB", "ZA"],
  ["RMO", "MD"],
  ["LCA", "CY"],
].map(([code, cc]) => at(code!, cc!));

/** `rules` with one base changed — proves a number comes from the rules, not from the code. */
function withBase(rules: PricingRules, pair: string, business: number): PricingRules {
  const base = rules.continents_pair[pair]!;
  return {
    ...rules,
    continents_pair: { ...rules.continents_pair, [pair]: { ...base, round_trip: { ...base.round_trip, business } } },
  };
}

describe("formulaPrice — the formula, on made-up rules", () => {
  it("adds the pair's base and every letter of both codes: JFK–ZRH round trip = 1,500 + 54 + 79", () => {
    expect(formulaPrice(R, JFK, ZRH, "round_trip", "business")).toBe(1633);
    expect(formulaPrice(R, JFK, ZRH, "round_trip", "first")).toBe(1776);
    expect(formulaPrice(R, JFK, ZRH, "one_way", "business")).toBe(900 + 54 + 79);
  });

  it("takes every number from the rules it is given — none is built in", () => {
    expect(formulaPrice(withBase(R, "NA-EU", 1501), JFK, ZRH, "round_trip", "business")).toBe(1634);
  });

  it("is the same in both directions, for every pair", () => {
    for (const a of SPREAD)
      for (const b of SPREAD)
        for (const trip of ["round_trip", "one_way"] as const)
          for (const cabin of ["business", "first", "premium_economy"] as const) {
            expect(formulaPrice(R, a, b, trip, cabin)).toBe(formulaPrice(R, b, a, trip, cabin));
          }
  });

  it("has no price outside North America, for an unknown country, for a code outside A–Z, or to the same airport", () => {
    expect(formulaPrice(R, at("RMO", "MD"), at("LHR", "GB"), "round_trip", "business")).toBeNull();
    expect(formulaPrice(R, at("LHR", "GB"), at("CDG", "FR"), "round_trip", "business")).toBeNull();
    expect(formulaPrice(R, JFK, at("ZZZ", "ZZ"), "round_trip", "business")).toBeNull();
    expect(formulaPrice(R, JFK, at("Z9Z", "CH"), "round_trip", "business")).toBeNull();
    expect(formulaPrice(R, JFK, JFK, "round_trip", "business")).toBeNull();
  });

  it("adds the Hawaii supplement between Honolulu and the United States only — not for Maui, not for Canada", () => {
    expect(formulaPrice(R, at("HNL", "US"), JFK, "round_trip", "business")).toBe(400 + 500 + 61 + 54);
    expect(formulaPrice(R, at("OGG", "US"), JFK, "round_trip", "business")).toBe(400 + 56 + 54);
    expect(formulaPrice(R, at("HNL", "US"), at("YVR", "CA"), "round_trip", "business")).toBe(400 + 61 + 92);
  });

  it("prices Istanbul — both airports — as Europe, as the BBC site does", () => {
    expect(formulaPrice(R, JFK, at("IST", "TR"), "round_trip", "business")).toBe(1500 + 54 + 75);
    expect(formulaPrice(R, JFK, at("SAW", "TR"), "round_trip", "business")).toBe(1500 + 54 + 70);
  });
});

describe("estimateFare — what a member may see", () => {
  it("shows business whenever the formula is positive", () => {
    expect(estimateFare(R, JFK, ZRH, "business")).toEqual({ amount: 1633, currency: "USD" });
  });

  it("shows first only when it is above business — on NA-AS it is not, so nothing", () => {
    expect(estimateFare(R, JFK, ZRH, "first")).toEqual({ amount: 1776, currency: "USD" });
    expect(formulaPrice(R, JFK, at("NRT", "JP"), "round_trip", "first")).toBe(1226);
    expect(estimateFare(R, JFK, at("NRT", "JP"), "business")).toEqual({ amount: 1933, currency: "USD" });
    expect(estimateFare(R, JFK, at("NRT", "JP"), "first")).toBeNull();
    for (const a of SPREAD)
      for (const b of SPREAD) {
        const first = estimateFare(R, a, b, "first");
        if (first) expect(first.amount).toBeGreaterThan(estimateFare(R, a, b, "business")!.amount);
      }
  });

  it("never shows a price of zero or less — in either cabin", () => {
    const negative = withBase(R, "LOCAL", -1000);
    expect(formulaPrice(negative, JFK, at("BOS", "US"), "round_trip", "business")).toBe(-883);
    expect(estimateFare(negative, JFK, at("BOS", "US"), "business")).toBeNull();
    expect(estimateFare(negative, JFK, at("BOS", "US"), "first")).toBeNull();
  });

  it("has no estimate where the formula has no price", () => {
    expect(estimateFare(R, at("RMO", "MD"), at("LHR", "GB"), "business")).toBeNull();
  });
});

describe("estimateFare — never where it would mislead (7 Oct review)", () => {
  const jfk = { code: "JFK", countryCode: "US", lat: 40.6413, lng: -73.7781 };
  const ewr = { code: "EWR", countryCode: "US", lat: 40.6925, lng: -74.1687 };
  const bos = { code: "BOS", countryCode: "US", lat: 42.3656, lng: -71.0096 };

  it("shows nothing between two airports of the same metro, though the formula has a price", () => {
    expect(distanceKm(jfk, ewr)).toBeLessThan(SAME_METRO_KM);
    expect(formulaPrice(R, jfk, ewr, "round_trip", "business")).toBe(527); // the raw formula, kept for parity
    expect(estimateFare(R, jfk, ewr, "business")).toBeNull();
  });

  it("still shows a real short flight beyond the metro (JFK–BOS, ~300 km)", () => {
    expect(distanceKm(jfk, bos)).toBeGreaterThan(SAME_METRO_KM);
    expect(estimateFare(R, jfk, bos, "business")).toEqual({ amount: 517, currency: "USD" });
  });

  it("shows nothing for a country whose continent the site has not confirmed — Cyprus could be Asia or Europe", () => {
    const lca = at("LCA", "CY");
    expect(formulaPrice(R, JFK, lca, "round_trip", "business")).not.toBeNull(); // the formula has a guess
    expect(estimateFare(R, JFK, lca, "business")).toBeNull(); // the member does not see it
    for (const cc of ["AM", "AZ", "GE", "GL", "KZ", "RU"])
      expect(estimateFare(R, JFK, at("XXA", cc), "business")).toBeNull();
  });

  it("reads country codes in any case — an import that writes 'us' still prices", () => {
    expect(formulaPrice(R, at("JFK", "us"), at("ZRH", "ch"), "round_trip", "business")).toBe(1633);
  });
});

/** Recursively reverses key order — Postgres jsonb hands keys back in its own order, never the loader's. */
const reverseKeys = (v: unknown): unknown =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .reverse()
          .map(([k, x]) => [k, reverseKeys(x)]),
      )
    : v;

describe("the rules' shape and fingerprint (ADR-IMPL-037)", () => {
  it("accepts the full shape", () => {
    expect(rulesProblems(R)).toEqual([]);
  });

  it("refuses a missing letter, an unknown pair, a fraction, cents, an unknown key — naming paths, never values", () => {
    const letters = { ...R.letters } as Record<string, unknown>;
    delete letters.Q;
    expect(rulesProblems({ ...R, letters })).toEqual(["letters.Q: Required"]);
    const pairs = { ...R.continents_pair, "NA-XX": R.continents_pair["NA-EU"] };
    expect(rulesProblems({ ...R, continents_pair: pairs }).join()).toContain("NA-XX");
    const fraction = rulesProblems({ ...R, hawaii_extra: { ...R.hawaii_extra, business: 512.75 } });
    expect(fraction).toHaveLength(1);
    expect(fraction[0]).toStartWith("hawaii_extra.business:");
    expect(fraction.join()).not.toContain("512");
    const cents = rulesProblems({ ...R, hawaii_extra: { ...R.hawaii_extra, first: 7_000_000 } });
    expect(cents.join()).not.toContain("7000000");
    expect(cents).toHaveLength(1);
    expect(rulesProblems({ ...R, note: "x" })).toHaveLength(1);
    expect(rulesProblems(null)).toHaveLength(1);
  });

  it("fingerprints the content, not the key order", () => {
    const fp = rulesFingerprint(R);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(rulesFingerprint(reverseKeys(R) as PricingRules)).toBe(fp);
    expect(rulesFingerprint(withBase(R, "NA-EU", 1501))).not.toBe(fp);
  });

  it("reads back what the loader stores, in whatever key order Postgres returns it", () => {
    const stored = storedPricingRules(R, new Date("2026-10-07T12:00:00Z"));
    expect(stored.loadedAt).toBe("2026-10-07T12:00:00.000Z");
    const read = readStoredRules(reverseKeys(JSON.parse(JSON.stringify(stored))));
    expect(read).toEqual({ ok: true, rules: R, fingerprint: rulesFingerprint(R) });
  });

  it("is missing without a row, and invalid for a wrong shape or a hand edit (fingerprint not the rules' own)", () => {
    expect(readStoredRules(null)).toEqual({ ok: false, reason: "missing" });
    expect(readStoredRules(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(readStoredRules("rules")).toEqual({ ok: false, reason: "invalid" });
    expect(readStoredRules({ enabled: true })).toEqual({ ok: false, reason: "invalid" });
    const edited = storedPricingRules(R);
    const handEdit = { ...edited, rules: withBase(R, "NA-EU", 1501) };
    expect(readStoredRules(handEdit)).toEqual({ ok: false, reason: "invalid" });
  });

  it("validates one stored value once — the flag cache hands back the same object", () => {
    const stored = storedPricingRules(R);
    expect(readStoredRules(stored)).toBe(readStoredRules(stored));
  });
});
