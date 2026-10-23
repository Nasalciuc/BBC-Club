import { askWithin, type AskFailure } from "./ask-within";

/** A fare's published price and its source, as a request records them when the member asks (ADR-IMPL-046). */
export type PublishedAtRequest = { amount: number; source: string };

/** The airline a request was made for, as its fare named it when the member asked (ADR-IMPL-056): the name the member
 *  read and, when the fare has one, its two-character code. */
export type CarrierAtRequest = { code: string | null; name: string };

/** The trip a fare is for: its route and cabin. A request made from it must be for the same outbound leg and cabin. */
export type FareTrip = { from: string; to: string; cabin: string };

/** What a request made from a fare records of it, read once from the catalog when the request is created — and its
 *  trip, which the request is checked against: `missing` when there is no such fare, null when it could not be read (an
 *  error, a timeout), so there is nothing to check and the request goes on. */
export type FareAtRequest = {
  published: PublishedAtRequest | null;
  carrier: CarrierAtRequest | null;
  trip: FareTrip | "missing" | null;
};

/** The fare as the catalog holds it (catalog.fares): its route and cabin, its price, the published price and that
 *  price's source, the currency, and its airline — the code and the name. */
export type CatalogFare = {
  routeFrom: string;
  routeTo: string;
  cabin: string;
  price: string;
  publishedPrice: string | null;
  publishedSource: string | null;
  currency: string;
  carrier: string | null;
  carrierName: string | null;
};

/** How long a fare request waits for its fare: one read by key; past this the request goes on. */
export const FARE_TIMEOUT_MS = 1_000;

/**
 * What a request made from a fare records of the fare's published price — read from the catalog when the request is
 * created, never taken from the app. Nothing when the fare is gone, has no published price or no source for it (a struck
 * price always carries its source — FTC), is not in US dollars (a request's fare is), or no longer costs what the app
 * sent: a fare re-priced since the member opened it would pair one price with another's reference.
 */
export function publishedAtRequest(
  fare: CatalogFare | null,
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

/** An airline's code as a fare carries it: two letters or digits (`BA`, `U2`). */
const CARRIER_CODE = /^[A-Z0-9]{2}$/;

/**
 * The airline a request made from a fare records (ADR-IMPL-056): the fare's carrier as its page named it — the name,
 * else the code, which is then the name the page shows (toFareVM) — with the code when it is a well-formed one. Kept
 * whatever the fare costs now: a re-priced fare is the same flight on the same airline. Nothing when the fare is gone
 * or names no airline — never "Unknown".
 */
export function carrierAtRequest(fare: Pick<CatalogFare, "carrier" | "carrierName"> | null): CarrierAtRequest | null {
  if (!fare) return null;
  const raw = fare.carrier?.trim().toUpperCase() ?? "";
  const code = CARRIER_CODE.test(raw) ? raw : null;
  const name = fare.carrierName?.trim() || code;
  return name ? { code, name } : null;
}

/**
 * Asks once for the fare a request is made from and keeps what the request records of it: the published price, for the
 * price the app sent, and the airline — and the fare's trip, to check the request against. An error or an answer slower
 * than `timeoutMs` records neither and checks nothing (the request is never refused for a read that failed), reported
 * by reason.
 */
export async function askFare(
  ask: () => Promise<CatalogFare | null>,
  priceAtRequest: number | undefined,
  opts: { timeoutMs?: number; unavailable: (reason: AskFailure, err?: unknown) => void },
): Promise<FareAtRequest> {
  const answer = await askWithin(ask, opts.timeoutMs ?? FARE_TIMEOUT_MS, opts.unavailable);
  const fare = answer?.value ?? null;
  // A fare that has closed is still a fare: an offline-queued request for it must not be lost.
  const trip: FareAtRequest["trip"] = !answer
    ? null
    : fare
      ? { from: fare.routeFrom.trim().toUpperCase(), to: fare.routeTo.trim().toUpperCase(), cabin: fare.cabin }
      : "missing";
  return { published: publishedAtRequest(fare, priceAtRequest), carrier: carrierAtRequest(fare), trip };
}
