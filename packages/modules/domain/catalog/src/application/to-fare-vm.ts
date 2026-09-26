import type { AirportVM, DestinationPinVM, FareVM } from "@bbc/shared/api/v1/fares";
import type { airports, fares } from "@bbc/db/schema/catalog";
import { calendarDayOffset, formatInZone } from "./flight-local";

type FareRow = typeof fares.$inferSelect;
type AirportRow = typeof airports.$inferSelect;

export function toAirportVM(row: AirportRow): AirportVM {
  return {
    code: row.code,
    city: row.city,
    name: row.name,
    countryCode: row.countryCode,
    lat: typeof row.lat === "number" ? row.lat : parseFloat(String(row.lat)),
    lng: typeof row.lng === "number" ? row.lng : parseFloat(String(row.lng)),
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
    fromPrice: row.fromPrice,
    hasOffer,
    region: row.region,
  };
}

function localClocks(
  departAt: string | null,
  arriveAt: string | null,
  originTz: string,
  destTz: string,
): { departLocal: string | null; arriveLocal: string | null; arriveDayOffset: number } {
  if (!departAt || !arriveAt) {
    return { departLocal: null, arriveLocal: null, arriveDayOffset: 0 };
  }
  const dep = formatInZone(departAt, originTz);
  const arr = formatInZone(arriveAt, destTz);
  return {
    departLocal: dep.hhmm,
    arriveLocal: arr.hhmm,
    arriveDayOffset: calendarDayOffset(dep.ymd, arr.ymd),
  };
}
