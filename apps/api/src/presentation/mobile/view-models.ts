import type { ProposalCardVM, ProposalDetailVM, ResponseState } from "@bbc/shared/api/v1/proposals";
import type { AirportVM, DestinationPinVM, FareVM } from "@bbc/shared/api/v1/fares";

type OfferRow = {
  id: string;
  title: string;
  contextLine: string | null;
  routeFrom: string;
  routeTo: string;
  cabin: "business" | "first";
  price: string;
  publishedPrice: string | null;
  currency: string;
  mediaUrl: string | null;
  mediaBlurhash: string | null;
  validUntil: Date;
  targeting: "user" | "segment" | "broadcast";
  body: string | null;
  flightFacts: {
    nonstop: boolean;
    durationMinutes: number;
    product?: string;
    carrier?: string;
    flightNumber?: string;
    departLocal?: string;
    arriveLocal?: string;
  } | null;
};

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
    ...(row.flightFacts ? { flightFacts: row.flightFacts } : {}),
    advisorName: "Julia Reed",
  };
}

type AirportRow = {
  code: string;
  name: string;
  city: string;
  countryCode: string;
  lat: string | number;
  lng: string | number;
};

export function toAirportVM(row: AirportRow): AirportVM {
  return {
    code: row.code,
    city: row.city,
    name: row.name,
    countryCode: row.countryCode,
    lat: typeof row.lat === "number" ? row.lat : parseFloat(row.lat),
    lng: typeof row.lng === "number" ? row.lng : parseFloat(row.lng),
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

export function toFareVM(row: FareRow, airports: { from: AirportRow; to: AirportRow }, hasOffer: boolean): FareVM {
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
