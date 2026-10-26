/**
 * Parity with the company's formula as the marketing agent implements it (which states it is identical to the BBC
 * site), ADR-IMPL-037. The rules are not in this repository: CI passes them in the PRICING_RULES_JSON secret — the
 * reference set the golden was generated from. With them, this engine must reproduce all 15,128 Python results (every
 * ordered pair of the agent's 62 airports, both trips, business and first), compared by SHA-256 only. Nothing here
 * prints a price, a rule or the secret. Without the secret the suite is skipped — unless PRICING_PARITY_REQUIRED=1 (CI).
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

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

describe.skipIf(!secret && !required)("formula parity with the Python engine", () => {
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

  it("reproduces all 15,128 results (SHA-256 of the canonical lines)", () => {
    const parsed = PricingRulesSchema.safeParse(input);
    expect(parsed.success, "no usable rules (first test)").toBe(true);
    if (!parsed.success) return;
    const rules: PricingRules = parsed.data;
    expect(rulesFingerprint(rules), "other rules (previous test): their results cannot match").toBe(
      golden.rulesFingerprint,
    );
    const airports = golden.airports.map(([code, countryCode]) => ({ code: code!, countryCode: countryCode! }));
    const lines: string[] = [];
    for (const from of airports)
      for (const to of airports) {
        if (from.code === to.code) continue;
        for (const trip of ["round_trip", "one_way"] as const)
          for (const cabin of ["business", "first"] as const) {
            const price = formulaPrice(rules, from, to, trip, cabin);
            lines.push(`${from.code}-${to.code}|${trip}|${cabin}|${price === null ? "null" : price}`);
          }
      }
    lines.sort();
    expect(lines.length).toBe(golden.routes);
    const sha256 = createHash("sha256").update(lines.join("\n")).digest("hex");
    expect(sha256, "the engine no longer reproduces the Python results").toBe(golden.sha256);
  });
});
