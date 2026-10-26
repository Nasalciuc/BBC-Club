import type { AirportVM, DestinationPinVM, HomePlaceVM, HomeVM, SiteDealVM } from "@bbc/shared/api/v1/fares";
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
 * arrival, then from Home's places, the arrivals no pin lists (ADR-IMPL-057); only an offer whose city Home names
 * nowhere keeps its own title — the price, and `Save 48%` only where the published fare is on record.
 */
export function offerCardModel(
  item: ProposalCardVM,
  destinations: readonly DestinationPinVM[],
  places: readonly HomePlaceVM[] = [],
): OfferCardModel {
  const place = destinations.find((d) => d.code === item.route.to) ?? places.find((p) => p.code === item.route.to);
  return {
    city: place?.city ?? item.title,
    country: countryName(place?.countryCode),
    fromPrice: formatPrice(item.price.offer, item.price.currency),
    savePercent: savingPercent(item.price),
    rating: item.rating != null ? item.rating.toFixed(1) : null,
  };
}

/** A card's model for one of the company site's deals (ADR-IMPL-067): the line naming where it leaves from, too. */
export type DealCardModel = OfferCardModel & { origin: string | null };

/**
 * What a site deal's card shows (02, 16): the destination's city and country, `from` and the site's price — a starting
 * price per person, no trip or cabin, since the site gives none — never `Save X%` (the site's "Old Price" has no source,
 * and the server never sends it) and never a star. `from New York` under the price when the deal leaves from another
 * city than the member's own: not their airport and not their city (a member at Newark sees New York's deals unnamed).
 */
export function dealCardModel(deal: SiteDealVM, home: Pick<AirportVM, "code" | "city"> | null): DealCardModel {
  const own =
    home !== null &&
    (deal.origin.code === home.code.toUpperCase() || deal.origin.city.toLowerCase() === home.city.toLowerCase());
  return {
    city: deal.destination.city,
    country: countryName(deal.destination.countryCode),
    fromPrice: formatPrice(deal.price.amount, deal.price.currency),
    savePercent: null,
    rating: null,
    origin: own ? null : `from ${deal.origin.city}`,
  };
}

/** Where a tap on a site deal goes: its destination, chosen as a pin chooses it (the route's sheet, 13). */
export function dealDestination(deal: SiteDealVM): AirportVM {
  const d = deal.destination;
  return { code: d.code, city: d.city, name: d.name, countryCode: d.countryCode, lat: d.lat, lng: d.lng };
}

/** The site's deals Home carries for "Offers to inspire", after the member's own offers; none from an older server. */
export function homeDeals(home: Pick<HomeVM, "deals"> | null): SiteDealVM[] {
  return home?.deals ?? [];
}

/** A site deal still within its day at `now` (D6); one whose `validUntil` cannot be read is not. */
export function dealLive(deal: Pick<SiteDealVM, "validUntil">, now: number): boolean {
  return Date.parse(deal.validUntil) > now;
}

/**
 * Home without the site's deals past their day at `now` (ADR-IMPL-067, D6) — the very same Home when none is, so nothing
 * draws again. The server sends only deals within their day; this is for a Home the app has held longer than that (a
 * phone that kept the app a day in the background), read when the app comes back, never while it draws.
 */
export function withLiveDeals<H extends Pick<HomeVM, "deals">>(home: H | null, now: number): H | null {
  const deals = home?.deals;
  if (!home || !deals || deals.every((deal) => dealLive(deal, now))) return home;
  return { ...home, deals: deals.filter((deal) => dealLive(deal, now)) };
}

/**
 * Every offer (16): what the raised sheet shows — the offers once Home has some (the member's own, or the site's deals,
 * ADR-IMPL-067); the cards' places while Home is on its way; `No offers yet.` only once Home answered without one,
 * never before (ADR-IMPL-047).
 */
export function sheetExpandedState(
  home: Pick<HomeVM, "sections" | "deals"> | null,
  homeLoading: boolean,
): "loading" | "empty" | "offers" {
  if (home && (home.sections.some((s) => s.items.length > 0) || homeDeals(home).length > 0)) return "offers";
  return !home && homeLoading ? "loading" : "empty";
}
