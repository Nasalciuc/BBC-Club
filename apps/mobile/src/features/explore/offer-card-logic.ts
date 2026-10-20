import type { DestinationPinVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { countryName } from "../../lib/countries";
import { formatPrice } from "../../lib/format";
import { savingPercent } from "../../lib/saving";

export type OfferCardModel = {
  city: string;
  country: string | null;
  fromPrice: string;
  savePercent: number | null;
  /** `4.8` beside the city (02, 16), as whoever made the offer gave it (ADR-IMPL-056); null — none is printed. */
  rating: string | null;
};

/**
 * What an offer card shows (02, 16): the destination's city and country — from Home's destinations, by the route's
 * arrival; an offer whose city Home does not list keeps its own title — the price, and `Save 48%` only where the
 * published fare is on record.
 */
export function offerCardModel(item: ProposalCardVM, destinations: readonly DestinationPinVM[]): OfferCardModel {
  const place = destinations.find((d) => d.code === item.route.to);
  return {
    city: place?.city ?? item.title,
    country: countryName(place?.countryCode),
    fromPrice: formatPrice(item.price.offer, item.price.currency),
    savePercent: savingPercent(item.price),
    rating: item.rating != null ? item.rating.toFixed(1) : null,
  };
}
