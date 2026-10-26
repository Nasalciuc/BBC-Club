import type { AirportVM, DestinationPinVM, EstimateVM, FareVM } from "@bbc/shared/api/v1/fares";
import type { airports, fares } from "@bbc/db/schema/catalog";
import { estimateFare } from "../pricing/estimate";
import type { PricingRules } from "../pricing/rules";
import { calendarDayOffset, formatInZone } from "./flight-local";

type FareRow = typeof fares.$inferSelect;
/** An airport as the catalog serves it — the one definition. The *Norm search columns are the trigger's (0023). */
export type AirportRow = Omit<typeof airports.$inferSelect, "cityNorm" | "nameNorm" | "countryNorm" | "termsNorm">;

export function toAirportVM(row: AirportRow): AirportVM {
  return {
    code: row.code,
    city: row.city,
    name: row.name,
    countryCode: row.countryCode,
    lat: typeof row.lat === "number" ? row.lat : parseFloat(String(row.lat)),
    lng: typeof row.lng === "number" ? row.lng : parseFloat(String(row.lng)),
    tz: row.tz,
    // ADR-IMPL-056: the destination's one line (04), or none — a row cached before 0031 has no such field.
    description: row.description ?? null,
  };
}

export function toFareVM(
  row: FareRow,
  airports: { from: AirportRow; to: AirportRow },
  hasOffer: boolean,
  offerId: string | null = null,
): FareVM {
  return {
    id: row.id,
    carrier: {
      code: row.carrier,
      name: row.carrierName ?? row.carrier ?? "Unknown",
      logoUrl: null,
    },
    from: { code: airports.from.code, city: airports.from.city },
    to: { code: airports.to.code, city: airports.to.city },
    cabin: row.cabin,
    product: row.product,
    nonstop: row.nonstop,
    durationMinutes: row.durationMinutes,
    departAt: row.departAt ? row.departAt.toISOString() : null,
    arriveAt: row.arriveAt ? row.arriveAt.toISOString() : null,
    ...localClocks(
      row.departAt ? row.departAt.toISOString() : null,
      row.arriveAt ? row.arriveAt.toISOString() : null,
      airports.from.tz,
      airports.to.tz,
    ),
    price: {
      offer: parseFloat(row.price),
      ...(row.publishedPrice
        ? {
            published: parseFloat(row.publishedPrice),
            ...(row.publishedSource ? { publishedSource: row.publishedSource } : {}),
          }
        : {}),
      currency: row.currency,
    },
    // What the price is for, as the catalogue says (ADR-IMPL-056); one way unless it says round trip.
    trip: row.trip,
    validUntil: row.validUntil.toISOString(),
    hasOffer,
    offerId,
  };
}

export function toDestinationPin(
  row: {
    code: string;
    name: string;
    city: string;
    countryCode: string;
    region: string;
    lat: number;
    lng: number;
    fromPrice: number;
    description?: string | null;
    priceSource?: "site" | "club";
  },
  hasOffer: boolean,
): DestinationPinVM {
  return {
    code: row.code,
    name: row.name,
    city: row.city,
    countryCode: row.countryCode,
    lat: row.lat,
    lng: row.lng,
    description: row.description ?? null,
    fromPrice: row.fromPrice,
    ...(row.priceSource ? { priceSource: row.priceSource } : {}),
    hasOffer,
    region: row.region,
  };
}

function localClocks(
  departAt: string | null,
  arriveAt: string | null,
  originTz: string,
  destTz: string,
): { departLocal: string | null; arriveLocal: string | null; arriveDayOffset: number; departDate: string | null } {
  if (!departAt) {
    return { departLocal: null, arriveLocal: null, arriveDayOffset: 0, departDate: null };
  }
  // The departure's clock and its day at the origin, named here from its zone: the app prints them as they are
  // (ADR-IMPL-019) — a fare with a departure and no arrival keeps both.
  const dep = formatInZone(departAt, originTz);
  if (!arriveAt) {
    return { departLocal: dep.hhmm, arriveLocal: null, arriveDayOffset: 0, departDate: dep.ymd };
  }
  const arr = formatInZone(arriveAt, destTz);
  return {
    departLocal: dep.hhmm,
    arriveLocal: arr.hhmm,
    arriveDayOffset: calendarDayOffset(dep.ymd, arr.ymd),
    departDate: dep.ymd,
  };
}

/**
 * The company's formula as a member may see it (ADR-IMPL-037): an indicative round-trip price in the chosen cabin, or
 * null where the formula has none. Callers show it only when the route has no fare.
 */
export function toEstimateVM(
  rules: PricingRules,
  from: AirportRow,
  to: AirportRow,
  cabin: "business" | "first",
): EstimateVM | null {
  const estimate = estimateFare(rules, pricedAirport(from), pricedAirport(to), cabin);
  return estimate ? { ...estimate, trip: "round_trip", cabin, basis: "formula" } : null;
}

/** An airport as the formula and the site's guards read it. */
export const pricedAirport = (a: AirportRow) => ({
  code: a.code.trim(),
  countryCode: a.countryCode,
  lat: Number(a.lat),
  lng: Number(a.lng),
});

/**
 * An indicative round-trip price whose source is said (ADR-IMPL-063): the company's site, with the moment it answered,
 * or the club's copy of the formula. `basis` stays `formula` — both are the company's formula, and shipped apps accept
 * no other value.
 */
export function sourcedEstimateVM(
  amount: number,
  cabin: "business" | "first",
  source: { kind: "site"; asOf: Date } | { kind: "club" },
): EstimateVM {
  return {
    amount,
    currency: "USD",
    trip: "round_trip",
    cabin,
    basis: "formula",
    source: source.kind,
    ...(source.kind === "site" ? { asOf: source.asOf.toISOString() } : {}),
  };
}
