/**
 * Parity with the company's formula (ADR-IMPL-037). The rules are not in this repository: CI passes them in the
 * PRICING_RULES_JSON secret — the reference set the golden was generated from. With them, this engine must reproduce all
 * 15,128 golden results (every ordered pair of the agent's 62 airports, both trips, business and first), compared by
 * SHA-256 only, twice: with the continents the company's site prices by, the club's own results since 2026-10-25
 * (ADR-IMPL-062: Turkey as Asia); and with the Python engine's (Turkey in Europe), the independent results of
 * 2026-10-07 — so every line but the deliberate change is still checked against another engine. Nothing here prints a
 * price, a rule or the secret. Without the secret the suite is skipped — unless PRICING_PARITY_REQUIRED=1 (CI).
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { CONTINENT_OF, type Continent } from "../../src/pricing/continents";
import { formulaPrice } from "../../src/pricing/estimate";
import { PricingRulesSchema, rulesFingerprint, rulesProblems, type PricingRules } from "../../src/pricing/rules";
import golden from "./pricing-golden.json";

const secret = process.env.PRICING_RULES_JSON?.trim() ?? "";
const required = process.env.PRICING_PARITY_REQUIRED === "1";

/** JSON.parse's own message can quote the input — never let it reach a log. */
function parseSecret(): unknown {
  try {
    return JSON.parse(secret);
  } catch {
    return undefined;
  }
}

/** SHA-256 of the golden's canonical lines, priced with `continents`, and how many lines there are. */
function goldenHash(rules: PricingRules, continents: Readonly<Record<string, Continent>>) {
  const airports = golden.airports.map(([code, countryCode]) => ({ code: code!, countryCode: countryCode! }));
  const lines: string[] = [];
  for (const from of airports)
    for (const to of airports) {
      if (from.code === to.code) continue;
      for (const trip of ["round_trip", "one_way"] as const)
        for (const cabin of ["business", "first"] as const) {
          const price = formulaPrice(rules, from, to, trip, cabin, continents);
          lines.push(`${from.code}-${to.code}|${trip}|${cabin}|${price === null ? "null" : price}`);
        }
    }
  lines.sort();
  return { count: lines.length, sha256: createHash("sha256").update(lines.join("\n")).digest("hex") };
}

describe.skipIf(!secret && !required)("formula parity with the reference results", () => {
  const input = secret ? parseSecret() : undefined;

  it("has the reference rules (repository secret PRICING_RULES_JSON)", () => {
    expect(secret.length > 0, "PRICING_RULES_JSON is empty — add the repository secret (ADR-IMPL-037)").toBe(true);
    expect(input !== undefined, "PRICING_RULES_JSON is not valid JSON").toBe(true);
    expect(rulesProblems(input)).toEqual([]);
  });

  it("holds the rules the golden was generated from (fingerprint)", () => {
    const parsed = PricingRulesSchema.safeParse(input);
    expect(parsed.success, "no usable rules (first test)").toBe(true);
    if (!parsed.success) return;
    expect(
      rulesFingerprint(parsed.data),
      "the secret holds other rules than the reference results were made from — CI keeps the reference set",
    ).toBe(golden.rulesFingerprint);
  });

  it("reproduces all 15,128 results with the site's continents (SHA-256 of the canonical lines)", () => {
    const parsed = PricingRulesSchema.safeParse(input);
    expect(parsed.success, "no usable rules (first test)").toBe(true);
    if (!parsed.success) return;
    const rules: PricingRules = parsed.data;
    expect(rulesFingerprint(rules), "other rules (previous test): their results cannot match").toBe(
      golden.rulesFingerprint,
    );
    const { count, sha256 } = goldenHash(rules, CONTINENT_OF);
    expect(count).toBe(golden.routes);
    expect(sha256, "the engine no longer reproduces the reference results").toBe(golden.sha256);
  });

  it("reproduces the Python engine's 15,128 results with its continents (Turkey in Europe)", () => {
    const parsed = PricingRulesSchema.safeParse(input);
    expect(parsed.success, "no usable rules (first test)").toBe(true);
    if (!parsed.success) return;
    expect(rulesFingerprint(parsed.data), "other rules (second test): their results cannot match").toBe(
      golden.rulesFingerprint,
    );
    const continents = { ...CONTINENT_OF, ...(golden.python.continents as Record<string, Continent>) };
    const { count, sha256 } = goldenHash(parsed.data, continents);
    expect(count).toBe(golden.routes);
    expect(sha256, "the engine no longer gives the Python engine's results where only the continents differ").toBe(
      golden.python.sha256,
    );
  });
});
