import type { Executor } from "@bbc/db";
import type { fares } from "@bbc/db/schema/catalog";
import type { EstimateVM } from "@bbc/shared/api/v1/fares";
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

/** A city a tap on the globe may open (ADR-IMPL-068): where it is, and what names it. */
export type BookablePlace = {
  code: string;
  name: string;
  city: string;
  countryCode: string;
  lat: number;
  lng: number;
};

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
  /**
   * ADR-IMPL-068: the cities a tap anywhere on the globe may open from `home` — the site's cities (each by its main
   * airport) and the US airports the site lists a price from, read from the night's snapshot and cached like the site's
   * pins, with `also` (the arrivals of the fares and offers the caller holds); never `home` itself, nor an airport
   * within 100 km of it when its coordinates are given (one metro: a tap there gets the home answer). A formula price
   * alone never makes a city bookable. Null while `catalog.globe_tap` is off: only the flag's row is read (through the
   * flags' cache), nothing of the set.
   */
  bookable(
    exec: Executor | undefined,
    q: { home: { code: string; lat?: number; lng?: number }; also?: readonly BookablePlace[] },
  ): Promise<BookablePlace[] | null>;
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
  importCsv(input: unknown): Promise<{ imported: number }>;
};
