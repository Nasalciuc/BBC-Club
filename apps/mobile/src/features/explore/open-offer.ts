import type { Href } from "expo-router";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import type { FareVM } from "@bbc/shared/api/v1/fares";

import { searchFares } from "@/lib/api";

/** The search a fare was found by (05's chips and `About this fare`): its days and its travelers. */
export type FareSearch = {
  depart: string | null;
  return: string | null;
  passengers: { adult: number; child: number; infant: number };
};

/** A fare's page; from a search, with the days and travelers it was searched for (05). */
export function fareHref(id: string, offerId?: string | null, search?: FareSearch | null): Href {
  const params: Record<string, string> = { id };
  if (offerId) params.offerId = offerId;
  if (search) {
    if (search.depart) params.depart = search.depart;
    if (search.depart && search.return) params.ret = search.return;
    params.adults = String(search.passengers.adult);
    if (search.passengers.child) params.children = String(search.passengers.child);
    if (search.passengers.infant) params.infants = String(search.passengers.infant);
  }
  return { pathname: "/fare/[id]", params } as unknown as Href;
}

export async function cheapestFareOnRoute(card: ProposalCardVM): Promise<FareVM | null> {
  const result = await searchFares({ from: card.route.from, to: card.route.to, cabin: card.cabin });
  if (!result.ok || result.data.items.length === 0) return null;
  return result.data.items.reduce((best, fare) => (fare.price.offer < best.price.offer ? fare : best));
}
