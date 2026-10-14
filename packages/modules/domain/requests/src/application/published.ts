import { askWithin, type AskFailure } from "./ask-within";

/** A fare's published price and its source, as a request records them when the member asks (ADR-IMPL-046). */
export type PublishedAtRequest = { amount: number; source: string };

/** The fare's prices as the catalog holds them (catalog.fares): its price, the published price and that price's
 *  source, the currency. */
export type FarePrices = {
  price: string;
  publishedPrice: string | null;
  publishedSource: string | null;
  currency: string;
};

/** How long a fare request waits for its fare's published price: one read by key; past this the request goes on. */
export const PUBLISHED_TIMEOUT_MS = 1_000;

/**
 * What a request made from a fare records of the fare's published price — read from the catalog when the request is
 * created, never taken from the app. Nothing when the fare is gone, has no published price or no source for it (a struck
 * price always carries its source — FTC), is not in US dollars (a request's fare is), or no longer costs what the app
 * sent: a fare re-priced since the member opened it would pair one price with another's reference.
 */
export function publishedAtRequest(
  fare: FarePrices | null,
  priceAtRequest: number | undefined,
): PublishedAtRequest | null {
  if (!fare || priceAtRequest == null) return null;
  const source = fare.publishedSource?.trim() ?? "";
  if (fare.publishedPrice == null || source === "" || fare.currency !== "USD") return null;
  const price = Number(fare.price);
  const amount = Number(fare.publishedPrice);
  if (!Number.isFinite(price) || !Number.isFinite(amount) || amount <= 0) return null;
  // In cents: the app sends 4200, the catalog holds "4200.00".
  if (Math.round(price * 100) !== Math.round(priceAtRequest * 100)) return null;
  return { amount, source };
}

/**
 * Asks for the fare a request is made from and keeps what it records of the published price. Like the estimate, it
 * decorates a request and never decides whether one is accepted: an error or an answer slower than `timeoutMs` records
 * none, reported by reason.
 */
export async function askPublished(
  ask: () => Promise<FarePrices | null>,
  priceAtRequest: number | undefined,
  opts: { timeoutMs?: number; unavailable: (reason: AskFailure, err?: unknown) => void },
): Promise<PublishedAtRequest | null> {
  const answer = await askWithin(ask, opts.timeoutMs ?? PUBLISHED_TIMEOUT_MS, opts.unavailable);
  return publishedAtRequest(answer?.value ?? null, priceAtRequest);
}
