import { z } from "zod";
import { PricePair, ProposalCardVM } from "./proposals";

// Prices are numeric(10,2) in Postgres → string from Drizzle → parseFloat in the mapper.
// No .int() on prices: fares have cents. PricePair lives in proposals.ts — never a second price shape.

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
  /** Wall clock at the origin / destination airport. Never the device TZ. */
  departLocal: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  arriveLocal: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  arriveDayOffset: z.number().int().min(0).max(2),
  price: PricePair,
  validUntil: z.string().datetime(),
  /** A promotional offer exists on this route. */
  hasOffer: z.boolean(),
  /** Linked offer when composed; catalog HTTP routes pass null. */
  offerId: z.string().uuid().nullable(),
});
export type FareVM = z.infer<typeof FareVM>;

export const AirportVM = z.object({
  code: z.string().length(3),
  city: z.string(),
  name: z.string(),
  countryCode: z.string().length(2),
  lat: z.number(),
  lng: z.number(),
  /** IANA zone, for the local time at the destination. Optional both ways: an older server sends none. Display-only:
   *  a malformed value becomes undefined instead of failing the whole response. */
  tz: z.string().optional().catch(undefined),
});
export type AirportVM = z.infer<typeof AirportVM>;

/**
 * An indicative price from the company's formula (ADR-IMPL-037). Never a fare: no carrier, no validity, not bookable —
 * and never a reference price (`PricePair.published` is for FTC-evidenced prices only). Fixed literals, so every other
 * value fails parsing instead of reaching the screen.
 */
export const EstimateVM = z.object({
  amount: z.number().positive(),
  currency: z.literal("USD"),
  trip: z.literal("round_trip"),
  cabin: z.enum(["business", "first"]),
  basis: z.literal("formula"),
});
export type EstimateVM = z.infer<typeof EstimateVM>;

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
  /** ProposalCardVM when a promotion exists on the route. */
  offer: ProposalCardVM.nullable(),
  /** Only when an undated search finds no fare in the chosen cabin and the environment has estimates on (ADR-IMPL-037).
   *  Optional both ways. The app parses the whole search with this schema, so an estimate it does not understand (a value
   *  added by a newer server) becomes null — the search still works, the estimate is not shown. */
  estimate: EstimateVM.nullable().optional().catch(null),
});
export type SearchResultVM = z.infer<typeof SearchResultVM>;

export const HomeVM = z.object({
  home: AirportVM.nullable(),
  destinations: z.array(DestinationPinVM),
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      items: z.array(ProposalCardVM),
    }),
  ),
});
export type HomeVM = z.infer<typeof HomeVM>;
