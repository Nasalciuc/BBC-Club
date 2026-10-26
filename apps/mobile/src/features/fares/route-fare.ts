import type { FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";

import { searchFares } from "@/lib/api";

/**
 * A catalogue fare on an offer's route and cabin — the earliest-closing cheapest one — for the flight facts the offer
 * does not state (the airline, the clocks, the time in the air). Never its price, its day or its id: an offer is
 * shown and requested as itself (offerFare, F067). Null when the search finds none or fails.
 */
export async function routeFareFor(offer: Pick<ProposalDetailVM, "route" | "cabin">): Promise<FareVM | null> {
  const result = await searchFares({ from: offer.route.from, to: offer.route.to, cabin: offer.cabin });
  if (!result.ok || result.data.items.length === 0) return null;
  return result.data.items.reduce((best, fare) => (fare.price.offer < best.price.offer ? fare : best));
}
