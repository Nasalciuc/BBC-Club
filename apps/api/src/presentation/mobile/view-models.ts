import type { ProposalCardVM, ProposalDetailVM, ResponseState } from "@bbc/shared/api/v1/proposals";

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
