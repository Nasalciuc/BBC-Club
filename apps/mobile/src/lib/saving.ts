import type { PricePair } from "@bbc/shared/api/v1/proposals";

/** A price pair as the screens may print it (ADR-IMPL-081). */
type Priced = Pick<PricePair, "offer" | "published" | "publishedSource">;

/** Whether a published (reference) price may be printed: only with its source beside it (DESIGN.md, FTC). */
export function publishedOnRecord(price: Priced): boolean {
  return price.published != null && Boolean(price.publishedSource?.trim());
}

/**
 * The pair without a published price that has no source (ADR-IMPL-081): an offer whose maker gave none, or a server
 * from before the club stopped sending one, shows its price alone — never `Down from $7,850`, never `Save 46%`, never
 * the comparison. The very same pair when there is nothing to take out.
 */
export function onRecord<P extends Priced>(price: P): P {
  if (price.published == null || publishedOnRecord(price)) return price;
  const rest = { ...price };
  delete rest.published;
  delete rest.publishedSource;
  return rest;
}

/**
 * `Save 48%` (02, 16, sheet 41): what the club's price saves on the published fare, in whole percent, rounded down so it
 * never says more than it saves. Only where the published fare is on record — with its source (FTC evidence,
 * ADR-IMPL-055, ADR-IMPL-081); none when there is no saving to speak of.
 */
export function savingPercent(price: Priced): number | null {
  if (!publishedOnRecord(price) || price.published == null || price.published <= price.offer) return null;
  const percent = Math.floor(((price.published - price.offer) / price.published) * 100);
  return percent >= 1 ? percent : null;
}
