import type { ProposalCardVM, ProposalDetailVM, ResponseState } from "@bbc/shared/api/v1/proposals";
import type { DestinationPinVM } from "@bbc/shared/api/v1/fares";
import type { OfferRow } from "@bbc/proposals";
import type { DestinationPin } from "@bbc/catalog";
export { toProfileVM } from "@bbc/members";

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
