import type { Href } from "expo-router";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import type { FareVM } from "@bbc/shared/api/v1/fares";

import { searchFares } from "@/lib/api";

export function fareHref(id: string, offerId?: string | null): Href {
  return {
    pathname: "/fare/[id]",
    params: offerId ? { id, offerId } : { id },
  } as unknown as Href;
}

export async function cheapestFareOnRoute(card: ProposalCardVM): Promise<FareVM | null> {
  const result = await searchFares({ from: card.route.from, to: card.route.to, cabin: card.cabin });
  if (!result.ok || result.data.items.length === 0) return null;
  return result.data.items.reduce((best, fare) => (fare.price.offer < best.price.offer ? fare : best));
}
