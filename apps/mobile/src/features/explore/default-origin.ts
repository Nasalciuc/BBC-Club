import type { AirportVM } from "@bbc/shared/api/v1/fares";

/**
 * Where a search starts when neither Home nor the profile names the member's airport: the BFF's own fallback
 * (DEFAULT_HOME_AIRPORT, ADR-IMPL-013), as the airport the app needs offline too. default-origin.test.ts keeps the two
 * the same airport.
 */
export const DEFAULT_ORIGIN: AirportVM = {
  code: "JFK",
  city: "New York",
  name: "John F Kennedy International",
  countryCode: "US",
  lat: 40.6413,
  lng: -73.7781,
};
