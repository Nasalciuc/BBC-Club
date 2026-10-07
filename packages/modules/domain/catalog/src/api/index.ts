import type { Executor } from "@bbc/db";
import type { fares, airports } from "@bbc/db/schema/catalog";
import { toAirportVM, toFareVM } from "../application/to-fare-vm";

export type FareRow = typeof fares.$inferSelect;
/** An airport as the catalog serves it. The *Norm search columns are the trigger's (0023), internal to search. */
export type AirportRow = Omit<typeof airports.$inferSelect, "cityNorm" | "nameNorm" | "countryNorm" | "termsNorm">;

export { toAirportVM, toFareVM };

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
  importCsv(input: unknown): Promise<{ imported: number }>;
};
