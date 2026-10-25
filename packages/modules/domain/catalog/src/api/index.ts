import type { Executor } from "@bbc/db";
import type { fares } from "@bbc/db/schema/catalog";
import type { EstimateVM, SiteDealVM } from "@bbc/shared/api/v1/fares";
import { toAirportVM, toFareVM } from "../application/to-fare-vm";

export type FareRow = typeof fares.$inferSelect;
export type { AirportRow } from "../application/to-fare-vm";
import type { AirportRow } from "../application/to-fare-vm";

export { toAirportVM, toFareVM };

/** An estimate as the facade answers it: what the search shows, and the fingerprint of the rules behind it — none when
 *  the company's site priced it (ADR-IMPL-063: `source: "site"`). */
export type IndicativeEstimate = EstimateVM & { rules?: string };

/** Cheapest published fare per destination from home — shape of destinations(). */
export type DestinationPin = {
  code: string;
  name: string;
  city: string;
  countryCode: string;
  region: string;
  lat: number;
  lng: number;
  /** The destination's one line under its city (04), or null (ADR-IMPL-056). */
  description: string | null;
  fromPrice: number;
  /** Who priced a site city's pin (ADR-IMPL-063): the company's site or the club's formula. Absent on a fare's pin, and
   *  on every pin while `catalog.site_prices` is off. */
  priceSource?: "site" | "club";
};

/**
 * One of the company site's deals for Home (ADR-IMPL-067): the view model, and what the BFF needs to keep a city off
 * "Offers to inspire" twice — every airport of the destination city, and every airport of the metro the deal leaves
 * from. The BFF sends only the view model.
 */
export type SiteDeal = SiteDealVM & { airports: string[]; originAirports: string[] };

/** The only import surface of @bbc/catalog. module.ts implements it; consumers import it. */
export type CatalogFacade = {
  /** At most 30 fares, cheapest first — the same bound the future full-text path will use. */
  searchFares(
    exec: Executor | undefined,
    q: { from: string; to: string; cabin: "business" | "first"; when?: Date },
  ): Promise<FareRow[]>;
  getFare(exec: Executor | undefined, id: string): Promise<FareRow | null>;
  /**
   * The home screen's pins: the cheapest published fare to each destination from `home`, then (ADR-IMPL-045, with
   * `catalog.site_pins` and estimates on) up to twelve of the site's cities listed from there, priced in `cabin` —
   * business unless the member's profile says first — by the formula, or (ADR-IMPL-063, with `catalog.site_prices` on)
   * by the site's stored answer, else the formula; never a call to the site.
   */
  destinations(
    exec: Executor | undefined,
    home: string,
    opts?: { cabin?: "business" | "first" },
  ): Promise<DestinationPin[]>;
  searchAirports(exec: Executor | undefined, q: string): Promise<AirportRow[]>;
  getAirport(exec: Executor | undefined, code: string): Promise<AirportRow | null>;
  /** Batch lookup; order is not guaranteed. Replaces getAirport in loops. */
  getAirports(exec: Executor | undefined, codes: readonly string[]): Promise<AirportRow[]>;
  /**
   * The indicative price an undated search shows for this route right now (ADR-IMPL-037), with the fingerprint of the
   * rules that computed it, or null: estimates off, no valid rules, an unknown airport, a published fare in this cabin,
   * or a route the formula does not price. A quote request whose app showed the estimate asks the same question
   * (ADR-IMPL-042), so the specialist sees the member's number. With `catalog.site_prices` on (ADR-IMPL-063): the site's
   * stored answer (`source: "site"`, no rules; none where the company has no price), else the formula
   * (`source: "club"`) — never a call to the site: a quote asks inside its transaction. A killed catalog still answers
   * (its facade stays so dependents boot): `catalog.estimates` off is the switch for estimates.
   */
  indicativeFor(
    exec: Executor | undefined,
    q: { from: string; to: string; cabin: "business" | "first" },
  ): Promise<IndicativeEstimate | null>;
  /**
   * ADR-IMPL-067: the company site's deals a member whose airport is `home` sees, at most `limit`, with `catalog.site_offers`
   * on (seeded off; none otherwise): from `home` and its metro first, then from the nearest cities the site sells from
   * by great-circle distance — a home the site sells nothing from (Seattle, Toronto, Chișinău) gets the nearest's — each
   * deal naming the city it leaves from; one deal per destination city, never the member's own; in the pins' order (the
   * site's home page first, then the busiest). Read from the snapshot (`site_routes`, twice a day), only deals still
   * served (`valid_until`, D6); the price is the site's "Price Today", never its "Old Price". Cached a minute with the
   * pins' generation; with an executor, read now.
   */
  siteDeals(exec: Executor | undefined, home: string, limit: number): Promise<SiteDeal[]>;
  importCsv(input: unknown): Promise<{ imported: number }>;
};
