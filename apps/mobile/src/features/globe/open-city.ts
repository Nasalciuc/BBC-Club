/**
 * What a chosen city opens with (ADR-IMPL-068, decision 4) — pure, so it runs under `bun test`.
 *
 * A pin's tap and a tap on the globe that snapped to a city choose through here alike: a city with a pin opens with its
 * pin's airport, one without with its entry in Home's `bookable` list — either way as an airport's six fields (code,
 * city, name, country, lat, lng). So the search, `state.to` and the recent search it leaves are the same whichever way
 * the city was chosen. The pin's price, offer, region and source stay on the pin; the zone and the line come with the
 * search's answer (`state.route`).
 */
import type { AirportVM, BookablePlaceVM, DestinationPinVM } from "@bbc/shared/api/v1/fares";

/**
 * The airport `code` opens with: its pin's, else the place a tap snapped to (when it is that city), else none — a code
 * with neither opens nothing, as a pin's tap on a pin Home no longer sends did before.
 */
export function cityToOpen(
  code: string,
  pins: readonly DestinationPinVM[],
  snapped: BookablePlaceVM | null = null,
): AirportVM | null {
  const from = pins.find((p) => p.code === code) ?? (snapped?.code === code ? snapped : null);
  if (!from) return null;
  return {
    code: from.code,
    city: from.city,
    name: from.name,
    countryCode: from.countryCode,
    lat: from.lat,
    lng: from.lng,
  };
}
