import type { FareVM } from "@bbc/shared/api/v1/fares";

/** The words the catalogue's fare view puts where a fare names no airline (catalog to-fare-vm.ts) — kept server-side,
 *  since `FareVM.carrier.name` is non-null and installed apps parse it. */
const NO_AIRLINE = "unknown";

/**
 * The fare's airline, or null when it names none: a fare with neither code nor a real name comes as
 * `{ code: null, name: "Unknown" }`, which the app never prints — the request sheet, the confirmation's trip card and
 * `About this fare` show no airline, as the server records none on the request (`carrierAtRequest`: never "Unknown").
 */
export function knownCarrier<C extends Pick<FareVM["carrier"], "code" | "name">>(
  carrier: C | null | undefined,
): C | null {
  if (!carrier) return null;
  if (carrier.code) return carrier;
  const name = carrier.name.trim();
  return name.length > 0 && name.toLowerCase() !== NO_AIRLINE ? carrier : null;
}

/**
 * A fare as a card prints it (`FareOverviewCard` on the fare's page, `FlightCard` in a destination's flight options):
 * a fare that names no airline carries no name to print — never `Unknown`. A fare with an airline is left as it is.
 */
export function withKnownCarrier<F extends { carrier: Pick<FareVM["carrier"], "code" | "name"> }>(fare: F): F {
  return knownCarrier(fare.carrier) ? fare : { ...fare, carrier: { ...fare.carrier, name: "" } };
}
