import type { FareWeather } from "@bbc/ui";

/**
 * The destination's weather over the trip's days (05's card). ADR-IMPL-056 §5 keeps the weather card; its service — the
 * provider, its terms and the attribution it asks for — is decided apart, and will be asked for the destination and the
 * days. Until then there is none: the card shows the fare alone, never a made-up forecast.
 */
export function useFareWeather(): FareWeather | null {
  return null;
}
