import type { Executor } from "@bbc/db";
import type { fares } from "@bbc/db/schema/catalog";
import type { EstimateVM } from "@bbc/shared/api/v1/fares";
import { toAirportVM, toFareVM } from "../application/to-fare-vm";

export type FareRow = typeof fares.$inferSelect;
export type { AirportRow } from "../application/to-fare-vm";
import type { AirportRow } from "../application/to-fare-vm";

export { toAirportVM, toFareVM };

/** An estimate as the facade answers it: what the search shows, and the fingerprint of the rules behind it. */
export type IndicativeEstimate = EstimateVM & { rules: string };

/** Cheapest published fare per destination from home — shape of destinations(). */
export type DestinationPin = {
  code: string;
  name: string;
  city: string;
  countryCode: string;
  region: string;
  lat: number;
  lng: number;
  fromPrice: number;
};

/** The only import surface of @bbc/catalog. module.ts implements it; consumers import it. */
export type CatalogFacade = {
  /** At most 30 fares, cheapest first — the same bound the future full-text path will use. */
  searchFares(
    exec: Executor | undefined,
    q: { from: string; to: string; cabin: "business" | "first"; when?: Date },
  ): Promise<FareRow[]>;
  getFare(exec: Executor | undefined, id: string): Promise<FareRow | null>;
  destinations(exec: Executor | undefined, home: string): Promise<DestinationPin[]>;
  searchAirports(exec: Executor | undefined, q: string): Promise<AirportRow[]>;
  getAirport(exec: Executor | undefined, code: string): Promise<AirportRow | null>;
  /** Batch lookup; order is not guaranteed. Replaces getAirport in loops. */
  getAirports(exec: Executor | undefined, codes: readonly string[]): Promise<AirportRow[]>;
  /**
   * The indicative price an undated search shows for this route right now (ADR-IMPL-037), with the fingerprint of the
   * rules that computed it, or null: estimates off, no valid rules, an unknown airport, a published fare in this cabin,
   * or a route the formula does not price. A quote request whose app showed the estimate asks the same question
   * (ADR-IMPL-042), so the specialist sees the member's number. A killed catalog still answers (its facade stays so
   * dependents boot): `catalog.estimates` off is the switch for estimates.
   */
  indicativeFor(
    exec: Executor | undefined,
    q: { from: string; to: string; cabin: "business" | "first" },
  ): Promise<IndicativeEstimate | null>;
  importCsv(input: unknown): Promise<{ imported: number }>;
};
