import type { PricePair } from "@bbc/shared/api/v1/proposals";

/**
 * `Save 48%` (02, 16, sheet 41): what the club's price saves on the published fare, in whole percent, rounded down so it
 * never says more than it saves. Only where the published fare is on record (its FTC evidence, ADR-IMPL-055); none
 * when there is no saving to speak of.
 */
export function savingPercent(price: Pick<PricePair, "offer" | "published">): number | null {
  if (price.published == null || price.published <= price.offer) return null;
  const percent = Math.floor(((price.published - price.offer) / price.published) * 100);
  return percent >= 1 ? percent : null;
}
