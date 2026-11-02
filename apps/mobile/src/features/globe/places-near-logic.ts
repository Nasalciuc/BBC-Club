/**
 * A tap on Explore's globe names the spot and offers its airports (ADR-IMPL-083) — pure, so it runs under `bun test`.
 *
 * The server answers with the town under the finger and the airports within 600 km (`GET /v1/places/near`); here the
 * answer becomes what Explore shows: the town and up to three airports to choose from — never the member's own airport
 * or its metro — or the calm answers ADR-IMPL-068 already has (nothing near; the member's own city).
 */
import type { NearAirportVM, NearLocalityVM } from "@bbc/shared/api/v1/fares";

import { countryName } from "@/lib/countries";

import { HOME_METRO_KM, greatCircleKm, roundKm } from "./globe-tap-logic";

/** How many airports the card offers. */
export const TAP_AIRPORTS = 3;
/** Within this distance of the town's centre the tap is in it (`Bălți, Moldova`); farther, near it (`Near Bălți`). */
export const IN_TOWN_KM = 15;

/**
 * The point sent to the server: to two decimals, about a kilometre — closer than any airport or town needs, and no
 * finer than that leaves the phone.
 */
export function pointToAsk(tap: { lat: number; lng: number }): { lat: string; lng: string } {
  return { lat: tap.lat.toFixed(2), lng: tap.lng.toFixed(2) };
}

export type TapChoices = {
  /** `Bălți, Moldova`, `Near Bălți, Moldova`, or `Airports near there` where no town is in reach. */
  title: string;
  airports: (NearAirportVM & { distance: string })[];
};

export type PlacesTap = { kind: "choices"; choices: TapChoices } | { kind: "answer"; answer: "none" | "home" };

type Spot = { lat: number; lng: number };

/** The card's title: the town and its country, `Near` it past IN_TOWN_KM; without a town, the airports alone. */
export function tapTitle(locality: NearLocalityVM | null): string {
  if (!locality) return "Airports near there";
  const country = countryName(locality.countryCode);
  const place = country ? `${locality.name}, ${country}` : locality.name;
  return locality.km <= IN_TOWN_KM ? place : `Near ${place}`;
}

/**
 * What Explore shows for the server's answer. The member's home airport and every airport of its metro (under
 * HOME_METRO_KM from it, as the server leaves them out of every list) are left out; the nearest three of the rest are
 * offered. Nothing left: the member's own city when the tap fell within its metro, else nothing near there.
 */
export function placesTap(
  answer: { locality: NearLocalityVM | null; airports: readonly NearAirportVM[] },
  tap: Spot,
  home: (Spot & { code: string }) | null,
): PlacesTap {
  const away = answer.airports.filter(
    (a) => !home || (a.code !== home.code && greatCircleKm(a, home) >= HOME_METRO_KM),
  );
  if (away.length === 0) {
    return { kind: "answer", answer: home && greatCircleKm(tap, home) < HOME_METRO_KM ? "home" : "none" };
  }
  return {
    kind: "choices",
    choices: {
      title: tapTitle(answer.locality),
      airports: away.slice(0, TAP_AIRPORTS).map((a) => ({ ...a, distance: `${roundKm(a.km)} km` })),
    },
  };
}
