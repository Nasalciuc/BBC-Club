import type { DestinationPinVM, HomeVM } from "@bbc/shared/api/v1/fares";
import type { Pin } from "@bbc/ui";

import { formatPrice } from "@/lib/format";

/** Maps home.destinations → Pin[]. Holds no product state — selection lives in useSearch. */
export function useDestinations(home: HomeVM | null, selectedCode: string | null) {
  const pins: Pin[] = (home?.destinations ?? []).map((d: DestinationPinVM) => ({
    code: d.code,
    lat: d.lat,
    lng: d.lng,
    hasOffer: d.hasOffer,
    fromPrice: formatPrice(d.fromPrice, "USD"),
  }));

  const homeCoord = home?.home ? { lat: home.home.lat, lng: home.home.lng } : null;

  function pinToAirport(code: string): DestinationPinVM | null {
    return home?.destinations.find((d) => d.code === code) ?? null;
  }

  return { pins, homeCoord, selected: selectedCode, pinToAirport };
}
