import type { FareVM } from "@bbc/shared/api/v1/fares";

import { cabinLabel } from "../explore/travel-preferences";
import { knownCarrier } from "../fares/known-carrier";
import { formatPrice } from "../../lib/format";
import { savingPercent } from "../../lib/saving";

/** The trip at the top of the request sheet (06; sheet 40 · 02), without its days — the sheet holds those. */
export type RequestSummary = {
  /** `New York to London`; the codes (`JFK → LHR`) when a city's name is not known. */
  title: string;
  /** `Business`. */
  cabin: string;
  /** `JFK 18:55 → LHR 07:00 +1` for a fare with its clocks; `JFK → LHR` otherwise. */
  route: string;
  /** A fare's airline — its code (the design's mark), its logo where it has one; a quote, or a fare that names no
   *  airline, has none. */
  carrier: { code: string | null; name: string; logoUrl: string | null } | null;
  /**
   * A fare's price and, where the published fare is on record, that fare struck with where it was published and what
   * the club's saves (06: `$3,900` over `$7,550 Save 48%`); a quote has no price yet.
   */
  price: { amount: string; percent: number | null; published: string | null; source: string | null } | null;
  /** What the price covers, as the catalogue sells the fare (ADR-IMPL-081); null for an offer or a fare that does not
   *  say — its price then stands whatever trip is asked. */
  trip: "round_trip" | "one_way" | null;
};

/**
 * The price the trip card prints for the trip being asked (ADR-IMPL-081): a fare sold one way is not the price of a
 * round trip, nor the reverse — then no price, never a number beside days it does not cover. A price whose trip is not
 * known (an offer) stands as it is.
 */
export function priceForTrip(
  summary: Pick<RequestSummary, "price" | "trip">,
  asked: "round" | "oneway",
): RequestSummary["price"] {
  if (!summary.price || summary.trip === null) return summary.price;
  const covers = summary.trip === "round_trip" ? "round" : "oneway";
  return covers === asked ? summary.price : null;
}

type SummaryFare = Pick<FareVM, "carrier" | "price" | "departLocal" | "arriveLocal" | "arriveDayOffset"> &
  Partial<Pick<FareVM, "trip">>;

/** The published fare only with its saving and its source — a struck price never stands without both (FTC). */
function summaryPrice(price: FareVM["price"]): NonNullable<RequestSummary["price"]> {
  const percent = savingPercent(price);
  const source = price.publishedSource?.trim() || null;
  const published = percent && price.published != null && source ? formatPrice(price.published, price.currency) : null;
  return { amount: formatPrice(price.offer, price.currency), percent, published, source: published ? source : null };
}

export function requestSummary(input: {
  fare?: SummaryFare | null;
  from: string;
  to: string;
  fromCity?: string | null;
  toCity?: string | null;
  cabin: "business" | "first";
}): RequestSummary {
  const { fare } = input;
  // A fare that names no airline (`Unknown` from the catalogue) shows none, as the server records none.
  const carrier = knownCarrier(fare?.carrier);
  const named = input.fromCity && input.toCity ? `${input.fromCity} to ${input.toCity}` : null;
  const plus = fare && fare.arriveDayOffset > 0 ? ` +${fare.arriveDayOffset}` : "";
  const route =
    fare?.departLocal && fare.arriveLocal
      ? `${input.from} ${fare.departLocal} → ${input.to} ${fare.arriveLocal}${plus}`
      : `${input.from} → ${input.to}`;
  return {
    title: named ?? `${input.from} → ${input.to}`,
    cabin: cabinLabel(input.cabin),
    route,
    carrier: carrier ? { code: carrier.code, name: carrier.name, logoUrl: carrier.logoUrl } : null,
    price: fare ? summaryPrice(fare.price) : null,
    trip: fare?.trip ?? null,
  };
}
