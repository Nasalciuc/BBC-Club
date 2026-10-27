import { z } from "zod";
import { PhotoCreditVM } from "./places";
import { PricePair, ProposalCardVM } from "./proposals";
import { isIanaZone } from "../../time-zone";

// Prices are numeric(10,2) in Postgres → string from Drizzle → parseFloat in the mapper.
// No .int() on prices: fares have cents. PricePair lives in proposals.ts — never a second price shape.

/**
 * Whether `ymd` (`YYYY-MM-DD`) names a day the calendar has: a month 1–12 and a day within that month's own length,
 * February's 29th only in a leap year — `2026-02-30`, `2026-04-31`, `2027-02-29` and `2026-13-01` are not days. The
 * contract refuses every other `departDate`, and the app asks the same before it prints a day.
 */
export function isCalendarDay(ymd: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

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
  /**
   * The departure's calendar day at the origin airport, `YYYY-MM-DD` — the day the fare page prints (`OCT 12`). The
   * server names it from the airport's zone; the instant and the wall clock alone cannot (UTC+13 and UTC−11 share
   * them). Absent from an older server's answer: the app then falls back to the clock. Only a day the calendar has
   * (`isCalendarDay`).
   */
  departDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isCalendarDay, "Not a day the calendar has")
    .nullable()
    .optional(),
  price: PricePair,
  /** What the price is for, as the catalogue says (ADR-IMPL-056): `round_trip` only where the catalogue says so — 04
   *  and 13 print `round trip` beside such a fare — else `one_way`. Optional both ways: an older server sends none, and
   *  a value this app does not know reads as none (the fare still lists; its trip is not printed). */
  trip: z.enum(["round_trip", "one_way"]).optional().catch(undefined),
  validUntil: z.string().datetime(),
  /** A promotional offer exists on this route. */
  hasOffer: z.boolean(),
  /** Linked offer when composed; catalog HTTP routes pass null. */
  offerId: z.string().uuid().nullable(),
});
export type FareVM = z.infer<typeof FareVM>;

/** Whether this runtime can show a time in `tz` — the one rule (shared/time-zone, ADR-IMPL-075), the catalogue
 *  import's too; remembered per name there. */
const isFormattableZone = isIanaZone;

export const AirportVM = z.object({
  code: z.string().length(3),
  city: z.string(),
  name: z.string(),
  countryCode: z.string().length(2),
  lat: z.number(),
  lng: z.number(),
  /** IANA zone, for the local time at the destination. Optional both ways: an older server sends none. Display-only:
   *  a zone this runtime cannot format in ("", "not/a_zone", a number) becomes undefined instead of failing the whole
   *  response, and the local time is simply not shown. */
  tz: z.string().refine(isFormattableZone).optional().catch(undefined),
  /** The destination's one line under its city (04: `Iconic sights, world-class culture and unforgettable
   *  experiences.`), from the catalogue (ADR-IMPL-056). Null until it has one — the line is left out, never made up.
   *  Optional both ways; a value this app cannot read reads as none, and the airport still parses. */
  description: z.string().trim().min(1).nullable().optional().catch(null),
});
export type AirportVM = z.infer<typeof AirportVM>;

/**
 * Who priced an indicative fare (ADR-IMPL-063): `site`, the company's own site (its search, read at `asOf`); `club`, the
 * club's copy of the company's formula (ADR-IMPL-037). Both are the company's formula — `basis` stays `formula`, which
 * shipped apps require. Absent: the club's formula, as every estimate was before the site's prices (and as every
 * estimate is while `catalog.site_prices` is off). A value this app does not know reads as absent.
 */
export const EstimateSource = z.enum(["site", "club"]);
export type EstimateSource = z.infer<typeof EstimateSource>;

/**
 * An indicative price from the company's formula (ADR-IMPL-037). Never a fare: no carrier, no validity, not bookable —
 * and never a reference price (`PricePair.published` is for FTC-evidenced prices only). Fixed literals, so every other
 * value fails parsing instead of reaching the screen. `source` and `asOf` say who priced it and when the site was read
 * (ADR-IMPL-063): optional both ways, so an app built before them shows the same number under the same words.
 */
export const EstimateVM = z.object({
  amount: z.number().positive(),
  currency: z.literal("USD"),
  trip: z.literal("round_trip"),
  cabin: z.enum(["business", "first"]),
  basis: z.literal("formula"),
  source: EstimateSource.optional().catch(undefined),
  /** When the company's site gave this price (`source: "site"` only); never more than 24 hours before the answer. */
  asOf: z.string().datetime().optional().catch(undefined),
});
export type EstimateVM = z.infer<typeof EstimateVM>;

export const DestinationPinVM = AirportVM.extend({
  fromPrice: z.number().positive(),
  hasOffer: z.boolean(),
  region: z.string(),
  /** Who priced a site city's pin (ADR-IMPL-063), as an estimate says it: absent on a fare's pin (a published fare) and
   *  on every pin while `catalog.site_prices` is off. Optional both ways; a value this app does not know reads as none. */
  priceSource: EstimateSource.optional().catch(undefined),
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

/** A city an offer goes to that no pin lists (ADR-IMPL-057): its card names the city and country from here. */
export const HomePlaceVM = z.object({
  code: z.string().length(3),
  city: z.string(),
  countryCode: z.string().length(2),
});
export type HomePlaceVM = z.infer<typeof HomePlaceVM>;

/**
 * A site deal's photograph (ADR-IMPL-067): the destination's city photo as `GET /v1/places/photos` serves it
 * (ADR-IMPL-043) — a card's and a full-width address, and the credit it owes (null: the club's own, nothing to credit).
 */
export const SiteDealPhotoVM = z.object({
  card: z.string().max(2048).url().startsWith("https://"),
  hero: z.string().max(2048).url().startsWith("https://"),
  credit: PhotoCreditVM.nullable(),
});
export type SiteDealPhotoVM = z.infer<typeof SiteDealPhotoVM>;

/**
 * One of the company site's deals (ADR-IMPL-067): its lowest price for a destination from a US city, `from $X` — whole
 * USD, per person, indicative (the site's own words: taxes in, "call for current best prices"). The site says no trip,
 * no cabin, no dates: the card prints none. Never a reference price — the site's "Old Price" has no source per deal, so
 * there is no `published` and no saving here at all (DESIGN.md: `Save 48%` only where the published fare is on record).
 * `origin` is the US city the deal leaves from — the member's own airport, or the nearest city the site sells from
 * ("from New York"). Shown until `validUntil`, at most a day after the site was read (D6).
 */
export const SiteDealVM = z.object({
  /** `site-<the site's deal id>-<origin airport>`: unique on one Home, stable from one read to the next. */
  id: z.string().min(1).max(64),
  /** Where the deal goes — an airport as a pin is, so a tap opens it as a pin does — and its city's photo. */
  destination: AirportVM.extend({
    /** Null until the city has a photograph (or with `catalog.place_photos` off): the app's own image. A value this app
     *  cannot read reads as none, and the deal still shows. */
    photo: SiteDealPhotoVM.nullable().catch(null),
  }),
  origin: z.object({ code: z.string().length(3), city: z.string().min(1) }),
  price: z.object({
    amount: z.number().int().positive(),
    currency: z.literal("USD"),
    /** The company's site, as its deal lists it: neither a fare nor the formula's estimate. */
    basis: z.literal("site"),
    /** A starting price: the card says `from`. */
    from: z.literal(true),
  }),
  validUntil: z.string().datetime(),
});
export type SiteDealVM = z.infer<typeof SiteDealVM>;

/**
 * A city a tap on Explore's globe may open (ADR-IMPL-068): the code, the city and where it is — and the airport's name
 * and country, so the city opens as a pin's does (the destination prints its country before its search answers).
 * No price: the city's search prices it, as a pin's search does.
 */
export const BookablePlaceVM = AirportVM.pick({
  code: true,
  city: true,
  name: true,
  countryCode: true,
  lat: true,
  lng: true,
});
export type BookablePlaceVM = z.infer<typeof BookablePlaceVM>;

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
  /** The arrivals of the offers that `destinations` does not list — a broadcast offer from another airport, an offer
   *  to a city with no fare from home — so a card names its city, never its title cut short (ADR-IMPL-057). Optional
   *  both ways: a server without it sends none, and the card keeps the title as before. */
  places: z.array(HomePlaceVM).optional(),
  /**
   * The company site's deals for "Offers to inspire", after the member's own offers (ADR-IMPL-067; `catalog.site_offers`).
   * Optional both ways: an app built before them never reads them, a server without them sends none. A deal this app
   * cannot read is left out, never the others; anything else unreadable reads as none, and Home still parses.
   */
  deals: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = SiteDealVM.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    )
    .optional()
    .catch(undefined),
  /**
   * The cities a tap anywhere on the globe may snap to (ADR-IMPL-068, `catalog.globe_tap`): the company's site's cities,
   * the arrivals of the fares and offers Home holds, and the US airports the site sells from — never the member's home
   * airport or another of its metro. Absent while the flag is off; optional both ways, and a list this app cannot read
   * reads as none — Home still parses, and a tap off the pins does nothing, as before.
   */
  bookable: z.array(BookablePlaceVM).optional().catch(undefined),
});
export type HomeVM = z.infer<typeof HomeVM>;
