import { z } from "zod";
const base = (type: string, version = 1) => ({ type: z.literal(type), version: z.literal(version) });

export const OfferPublishedV1 = z.object({
  ...base("offer.published"),
  offerId: z.string().uuid(),
  targeting: z.enum(["user", "segment", "broadcast"]),
  targetMemberId: z.string().nullable(),
  routeFrom: z.string().length(3),
  routeTo: z.string().length(3),
  cabin: z.enum(["business", "first"]),
  title: z.string(),
  validUntil: z.string().datetime(),
  publishedAt: z.string().datetime(),
});
export const OfferExpiredV1 = z.object({
  ...base("offer.expired"),
  offerId: z.string().uuid(),
  expiredAt: z.string().datetime(),
});
export const OfferWithdrawnV1 = z.object({
  ...base("offer.withdrawn"),
  offerId: z.string().uuid(),
  reason: z.string().optional(),
  withdrawnAt: z.string().datetime(),
});
export const OfferViewedV1 = z.object({
  ...base("offer.viewed"),
  offerId: z.string().uuid(),
  memberId: z.string(),
  viewedAt: z.string().datetime(),
});
export const OfferRespondedV1 = z.object({
  ...base("offer.responded"),
  offerId: z.string().uuid(),
  memberId: z.string(),
  response: z.enum(["interested", "dismissed"]),
  at: z.string().datetime(),
});
