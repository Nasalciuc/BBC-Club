import type { FareVM } from "@bbc/shared/api/v1/fares";

import { cabinLabel } from "../explore/travel-preferences";
import { formatPrice } from "../../lib/format";

/** The request sheet's fare summary, three lines (Figma 135:849). */
export type RequestSummary = {
  /** `New York to London`; the codes (`JFK → LHR`) when a city's name is not known. */
  title: string;
  /** `JFK → LHR · British Airways · Business`: the route, the airline when there is a fare, the cabin. */
  facts: string;
  /** `$4,200 per traveler` for a fare; nothing for a quote, which has no price yet. */
  price: string | null;
};

export function requestSummary(input: {
  fare?: Pick<FareVM, "carrier" | "price"> | null;
  from: string;
  to: string;
  fromCity?: string | null;
  toCity?: string | null;
  cabin: "business" | "first";
}): RequestSummary {
  const route = `${input.from} → ${input.to}`;
  const named = input.fromCity && input.toCity ? `${input.fromCity} to ${input.toCity}` : null;
  return {
    title: named ?? route,
    facts: [route, input.fare?.carrier.name ?? null, cabinLabel(input.cabin)].filter(Boolean).join(" · "),
    price: input.fare ? `${formatPrice(input.fare.price.offer, input.fare.price.currency)} per traveler` : null,
  };
}
