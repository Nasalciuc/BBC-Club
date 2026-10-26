import type { AirportVM, DestinationPinVM, HomeVM } from "@bbc/shared/api/v1/fares";
import type { Pin } from "@bbc/ui";

import { formatPrice } from "@/lib/format";

/** Maps home.destinations → Pin[]. Holds no product state — selection lives in useSearch.
 *  A destination chosen from search that has no fare still gets its pin, so the globe shows the route asked for. */
export function useDestinations(home: HomeVM | null, selected: AirportVM | null) {
  const withFares: Pin[] = (home?.destinations ?? []).map((d: DestinationPinVM) => ({
    code: d.code,
    city: d.city,
    lat: d.lat,
    lng: d.lng,
    hasOffer: d.hasOffer,
    fromPrice: formatPrice(d.fromPrice, "USD"),
    price: d.fromPrice,
  }));
  const pins: Pin[] =
    selected && !withFares.some((p) => p.code === selected.code)
      ? [
          ...withFares,
          {
            code: selected.code,
            city: selected.city,
            lat: selected.lat,
            lng: selected.lng,
            hasOffer: false,
            fromPrice: "",
          },
        ]
      : withFares;
  const selectedCode = selected?.code ?? null;

  // 13: home's code at the route's start.
  const homeCoord = home?.home ? { lat: home.home.lat, lng: home.home.lng, code: home.home.code } : null;

  function pinToAirport(code: string): DestinationPinVM | null {
    return home?.destinations.find((d) => d.code === code) ?? null;
  }

  return { pins, homeCoord, selected: selectedCode, pinToAirport };
}
