import type { ProposalCardVM, ProposalDetailVM, ResponseState } from "@bbc/shared/api/v1/proposals";
import type { AirportVM, DestinationPinVM, FareVM } from "@bbc/shared/api/v1/fares";
import type { OfferRow } from "@bbc/proposals";
import type { DestinationPin } from "@bbc/catalog";

function resolveState(raw: "interested" | "dismissed" | null | undefined): ResponseState {
  if (raw === "interested") return "interested";
  if (raw === "dismissed") return "dismissed";
  return "unseen";
}

export function toCard(row: OfferRow, state: "interested" | "dismissed" | null | undefined): ProposalCardVM {
  return {
    id: row.id,
    title: row.title,
    ...(row.contextLine ? { contextLine: row.contextLine } : {}),
    route: { from: row.routeFrom, to: row.routeTo },
    cabin: row.cabin,
    price: {
      offer: parseFloat(row.price),
      ...(row.publishedPrice ? { published: parseFloat(row.publishedPrice) } : {}),
      currency: row.currency,
    },
    ...(row.mediaUrl ? { mediaUrl: row.mediaUrl } : {}),
    ...(row.mediaBlurhash ? { mediaBlurhash: row.mediaBlurhash } : {}),
    validUntil: row.validUntil.toISOString(),
    state: resolveState(state),
    targeting: row.targeting === "broadcast" ? "broadcast" : "personal",
  };
}

export function toDetail(row: OfferRow, state: "interested" | "dismissed" | null | undefined): ProposalDetailVM {
  const card = toCard(row, state);
  return {
    ...card,
    ...(row.body ? { body: row.body } : {}),
    ...(row.flightFacts
      ? {
          flightFacts: {
            nonstop: row.flightFacts.nonstop,
            durationMinutes: row.flightFacts.durationMinutes,
            ...(row.flightFacts.product ? { product: row.flightFacts.product } : {}),
            ...(row.flightFacts.carrier ? { carrier: row.flightFacts.carrier } : {}),
            ...(row.flightFacts.flightNumber ? { flightNumber: row.flightFacts.flightNumber } : {}),
            ...(row.flightFacts.departLocal ? { departLocal: row.flightFacts.departLocal } : {}),
            ...(row.flightFacts.arriveLocal ? { arriveLocal: row.flightFacts.arriveLocal } : {}),
          },
        }
      : {}),
    advisorName: "Julia Reed",
  };
}

export function toAirportVM(row: {
  code: string;
  name: string;
  city: string;
  countryCode: string;
  lat: string | number;
  lng: string | number;
}): AirportVM {
  return {
    code: row.code,
    city: row.city,
    name: row.name,
    countryCode: row.countryCode,
    lat: typeof row.lat === "number" ? row.lat : parseFloat(String(row.lat)),
    lng: typeof row.lng === "number" ? row.lng : parseFloat(String(row.lng)),
  };
}

export function toDestinationPin(row: DestinationPin, hasOffer: boolean): DestinationPinVM {
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

type FareRow = {
  id: string;
  routeFrom: string;
  routeTo: string;
  cabin: "business" | "first";
  carrier: string | null;
  carrierName: string | null;
  product: string | null;
  nonstop: boolean;
  durationMinutes: number | null;
  departAt: Date | null;
  arriveAt: Date | null;
  price: string;
  publishedPrice: string | null;
  publishedSource: string | null;
  currency: string;
  validUntil: Date;
};

export function toFareVM(
  row: FareRow,
  airports: {
    from: {
      code: string;
      city: string;
      name?: string;
      countryCode?: string;
      lat?: string | number;
      lng?: string | number;
    };
    to: {
      code: string;
      city: string;
      name?: string;
      countryCode?: string;
      lat?: string | number;
      lng?: string | number;
    };
  },
  hasOffer: boolean,
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
  };
}
