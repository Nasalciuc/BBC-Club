import type { FareVM } from "@bbc/shared/api/v1/fares";

import { cabinLabel } from "../explore/travel-preferences";
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
  /** A fare's airline — its logo where it has one; a quote has none yet. */
  carrier: { name: string; logoUrl: string | null } | null;
  /** A fare's price (one way) and, where the published fare is on record, what it saves; a quote has no price yet. */
  price: { amount: string; percent: number | null } | null;
};

type SummaryFare = Pick<FareVM, "carrier" | "price" | "departLocal" | "arriveLocal" | "arriveDayOffset">;

export function requestSummary(input: {
  fare?: SummaryFare | null;
  from: string;
  to: string;
  fromCity?: string | null;
  toCity?: string | null;
  cabin: "business" | "first";
}): RequestSummary {
  const { fare } = input;
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
    carrier: fare ? { name: fare.carrier.name, logoUrl: fare.carrier.logoUrl } : null,
    price: fare
      ? { amount: formatPrice(fare.price.offer, fare.price.currency), percent: savingPercent(fare.price) }
      : null,
  };
}
