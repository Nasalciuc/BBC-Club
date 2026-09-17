import { z } from "zod";
import { PricePair } from "./proposals";

// Prices are numeric(10,2) in Postgres → string from Drizzle → parseFloat in the mapper.
// No .int() on any price: fares have cents. PricePair lives in proposals.ts — never a second price shape.

export const FareVM = z.object({
  id: z.string().uuid(),
  carrier: z.object({
    code: z.string().length(2).nullable(),
    name: z.string(),
    logoUrl: z.string().url().nullable(),
  }),
  from: z.object({ code: z.string().length(3), city: z.string() }),
  to: z.object({ code: z.string().length(3), city: z.string() }),
  cabin: z.enum(["business", "first"]),
  product: z.string().nullable(),
  nonstop: z.boolean(),
  durationMinutes: z.number().int().positive().nullable(),
  /** null when the source has no times — the row renders "from $X" instead of inventing a departure. */
  departAt: z.string().datetime().nullable(),
  arriveAt: z.string().datetime().nullable(),
  price: PricePair,
  validUntil: z.string().datetime(),
  /** A promotional offer exists on this route. */
  hasOffer: z.boolean(),
});
export type FareVM = z.infer<typeof FareVM>;

export const AirportVM = z.object({
  code: z.string().length(3),
  city: z.string(),
  name: z.string(),
  countryCode: z.string().length(2),
  lat: z.number(),
  lng: z.number(),
});
export type AirportVM = z.infer<typeof AirportVM>;

export const DestinationPinVM = AirportVM.extend({
  fromPrice: z.number().positive(),
  hasOffer: z.boolean(),
  region: z.string(),
});
export type DestinationPinVM = z.infer<typeof DestinationPinVM>;

export const SearchResultVM = z.object({
  from: AirportVM,
  to: AirportVM,
  items: z.array(FareVM),
  /** OfferCardVM when a promotion exists on the route; kept loose until that contract lands. */
  offer: z.lazy(() => z.any()).nullable(),
});
export type SearchResultVM = z.infer<typeof SearchResultVM>;

export const HomeVM = z.object({
  home: AirportVM.nullable(),
  destinations: z.array(DestinationPinVM),
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      items: z.array(z.any()),
    }),
  ),
});
export type HomeVM = z.infer<typeof HomeVM>;
