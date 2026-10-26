import type { PricingRules } from "../../src/pricing/rules";

const cabins = (business: number, first: number, premium_economy: number) => ({ business, first, premium_economy });

/**
 * Made-up rules with the real shape (ADR-IMPL-037) — not the company's numbers, which are not in this repository.
 * Letter i (A = 0 … Z = 25) is worth business 10 + i, first 30 + 2i, premium economy 5 + i. First sits below business
 * on NA-AS (so it is hidden there) and premium economy is negative on LOCAL, so every display rule has a case.
 * JFK → ZRH round trip: business 1,500 + 54 + 79 = 1,633; first 1,450 + 138 + 188 = 1,776.
 */
export const FIXTURE_RULES: PricingRules = {
  letters: Object.fromEntries(
    [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((letter, i) => [letter, cabins(10 + i, 30 + 2 * i, 5 + i)]),
  ),
  continents_pair: {
    LOCAL: { round_trip: cabins(400, 900, -100), one_way: cabins(250, 610, -150) },
    "NA-AF": { round_trip: cabins(2000, 2600, 1500), one_way: cabins(1200, 1550, 900) },
    "NA-AS": { round_trip: cabins(1800, 900, 1200), one_way: cabins(1150, 550, 700) },
    "NA-EU": { round_trip: cabins(1500, 1450, 900), one_way: cabins(900, 850, 550) },
    "NA-OC": { round_trip: cabins(2300, 3000, 1800), one_way: cabins(1450, 1800, 1150) },
    "NA-SA": { round_trip: cabins(1150, 1700, 800), one_way: cabins(640, 1000, 500) },
  },
  hawaii_extra: cabins(500, 700, 300),
};
