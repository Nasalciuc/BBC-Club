import { createHash } from "node:crypto";
import { z } from "zod";

export type RuleCabin = "business" | "first" | "premium_economy";
export type RuleTrip = "round_trip" | "one_way";
export const RULE_PAIRS = ["LOCAL", "NA-AF", "NA-AS", "NA-EU", "NA-OC", "NA-SA"] as const;
export type RulePair = (typeof RULE_PAIRS)[number];

/** Whole dollars. The bound only catches a unit mistake (cents) or a typo, far outside any fare. */
const Amount = z.number().int().gte(-100_000).lte(100_000);
const ByCabin = z.object({ business: Amount, first: Amount, premium_economy: Amount }).strict();
const ByTrip = z.object({ round_trip: ByCabin, one_way: ByCabin }).strict();
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

/**
 * The shape of the company's price rules (ADR-IMPL-037). Their values are not in this repository: each environment keeps
 * them in the flag row `catalog.pricing_rules`, written by scripts/load-pricing-rules.ts, and CI in the
 * PRICING_RULES_JSON secret. Field names as in the marketing agent's data/price_generator_rules.json, plus
 * `hawaii_extra` (a constant in its engine). Strict: a missing or unknown letter, pair, trip or cabin is refused.
 */
export const PricingRulesSchema = z
  .object({
    letters: z.object(Object.fromEntries(LETTERS.map((letter) => [letter, ByCabin]))).strict(),
    continents_pair: z.object(Object.fromEntries(RULE_PAIRS.map((pair) => [pair, ByTrip]))).strict(),
    hawaii_extra: ByCabin,
  })
  .strict();

type Amounts = Readonly<Record<RuleCabin, number>>;
export type PricingRules = {
  readonly letters: Readonly<Record<string, Amounts>>;
  readonly continents_pair: Readonly<Record<string, Readonly<Record<RuleTrip, Amounts>>>>;
  readonly hawaii_extra: Amounts;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Names a rule set without revealing it: SHA-256 of its canonical JSON (keys sorted), first 16 hex characters. The
 * loader prints it, the flag row stores it, the parity golden pins the reference set's.
 */
export function rulesFingerprint(rules: PricingRules): string {
  return createHash("sha256").update(canonicalJson(rules)).digest("hex").slice(0, 16);
}

/** The value of the flag row `catalog.pricing_rules`. */
export type StoredPricingRules = { rules: PricingRules; fingerprint: string; loadedAt: string };

export function storedPricingRules(rules: PricingRules, now = new Date()): StoredPricingRules {
  return { rules, fingerprint: rulesFingerprint(rules), loadedAt: now.toISOString() };
}

const StoredSchema = z.object({ rules: PricingRulesSchema, fingerprint: z.string(), loadedAt: z.string() });

export type RulesLookup =
  { ok: true; rules: PricingRules; fingerprint: string } | { ok: false; reason: "missing" | "invalid" };

/** One validation per stored value: the flag cache hands back the same object until it refreshes. */
const checked = new WeakMap<object, RulesLookup>();

/**
 * The rules a search may use, from the flag row's value. "missing": no row (or an unreadable one — the flag read never
 * throws). "invalid": the shape is wrong, or the fingerprint is not the rules' own — the row was edited by hand instead
 * of through the loader. Either way the search shows no estimate; it never fails.
 */
export function readStoredRules(value: unknown): RulesLookup {
  if (value === null || value === undefined) return { ok: false, reason: "missing" };
  if (typeof value !== "object") return { ok: false, reason: "invalid" };
  const known = checked.get(value);
  if (known) return known;
  const parsed = StoredSchema.safeParse(value);
  const result: RulesLookup =
    parsed.success && rulesFingerprint(parsed.data.rules) === parsed.data.fingerprint
      ? { ok: true, rules: parsed.data.rules, fingerprint: parsed.data.fingerprint }
      : { ok: false, reason: "invalid" };
  checked.set(value, result);
  return result;
}

/** Where a rule file fails the shape — paths only, never a value (the rules are confidential). */
export function rulesProblems(input: unknown): string[] {
  const parsed = PricingRulesSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}
