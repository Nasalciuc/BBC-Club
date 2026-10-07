/**
 * The company's price formula (ADR-IMPL-037): the base for the continent pair (trip, cabin), plus the value of every
 * letter of both IATA codes, plus the Hawaii supplement between HNL and the United States. Only routes that touch North
 * America have a price. A port of Nasalciuc/BBC-Marketing-Agent services/pricing_engine.py. The rules are a parameter —
 * their values are not in this repository; the parity test (tests/parity) pins this engine to the Python results.
 */
import { CONTINENT_OF, UNCONFIRMED_COUNTRIES } from "./continents";
import type { PricingRules, RuleCabin, RuleTrip } from "./rules";

/** Coordinates are optional: without them the same-metro guard cannot apply, everything else does. */
export type PricedAirport = { code: string; countryCode: string; lat?: number; lng?: number };
export type Estimate = { amount: number; currency: "USD" };

function lettersValue(rules: PricingRules, code: string, cabin: RuleCabin): number | null {
  let sum = 0;
  for (const letter of code.toUpperCase()) {
    const value = rules.letters[letter]?.[cabin];
    if (value === undefined) return null;
    sum += value;
  }
  return sum;
}

/** The raw formula, any cabin, before the display rules. null wherever the formula has no price — never a guess. */
export function formulaPrice(
  rules: PricingRules,
  from: PricedAirport,
  to: PricedAirport,
  trip: RuleTrip,
  cabin: RuleCabin,
): number | null {
  const a = CONTINENT_OF[from.countryCode.toUpperCase()];
  const b = CONTINENT_OF[to.countryCode.toUpperCase()];
  if (!a || !b || from.code === to.code) return null;
  if (a !== "NA" && b !== "NA") return null;
  const pair = a === "NA" && b === "NA" ? "LOCAL" : `NA-${a === "NA" ? b : a}`;
  const base = rules.continents_pair[pair]?.[trip]?.[cabin];
  if (base === undefined) return null;
  const fromLetters = lettersValue(rules, from.code, cabin);
  const toLetters = lettersValue(rules, to.code, cabin);
  if (fromLetters === null || toLetters === null) return null;
  const hawaii =
    (from.code === "HNL" && to.countryCode.toUpperCase() === "US") ||
    (from.countryCode.toUpperCase() === "US" && to.code === "HNL")
      ? rules.hawaii_extra[cabin]
      : 0;
  return base + hawaii + fromLetters + toLetters;
}

/** Under this distance two airports serve the same metro (JFK–EWR 33 km, SFO–OAK 18 km): no flight to price. */
export const SAME_METRO_KM = 100;

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * What a member may see (approved 7 Oct 2026): the estimate follows the chosen cabin. Business whenever the formula is
 * positive; first only when positive and above business — otherwise no estimate, and the member asks for a quote.
 * Premium economy never: the formula's values there can be negative, and the BBC site hides them too.
 * Never where it would mislead (7 Oct review): two airports of the same metro (the formula would price the "flight"
 * between them), or a country whose continent the site has not confirmed (UNCONFIRMED_COUNTRIES).
 */
export function estimateFare(
  rules: PricingRules,
  from: PricedAirport,
  to: PricedAirport,
  cabin: "business" | "first",
  trip: RuleTrip = "round_trip",
): Estimate | null {
  if (
    UNCONFIRMED_COUNTRIES.has(from.countryCode.toUpperCase()) ||
    UNCONFIRMED_COUNTRIES.has(to.countryCode.toUpperCase())
  ) {
    return null;
  }
  if (
    from.lat !== undefined &&
    from.lng !== undefined &&
    to.lat !== undefined &&
    to.lng !== undefined &&
    distanceKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) < SAME_METRO_KM
  ) {
    return null;
  }
  const business = formulaPrice(rules, from, to, trip, "business");
  if (business === null || business <= 0) return null;
  if (cabin === "business") return { amount: business, currency: "USD" };
  const first = formulaPrice(rules, from, to, trip, "first");
  return first !== null && first > business ? { amount: first, currency: "USD" } : null;
}
