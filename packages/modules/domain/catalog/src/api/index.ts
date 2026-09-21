import type { Executor } from "@bbc/db";
import type { fares, airports } from "@bbc/db/schema/catalog";

export type FareRow = typeof fares.$inferSelect;
export type AirportRow = typeof airports.$inferSelect;

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
  searchFares(
    exec: Executor | undefined,
    q: { from: string; to: string; cabin: "business" | "first"; when?: Date },
  ): Promise<FareRow[]>;
  getFare(exec: Executor | undefined, id: string): Promise<FareRow | null>;
  destinations(exec: Executor | undefined, home: string): Promise<DestinationPin[]>;
  searchAirports(exec: Executor | undefined, q: string): Promise<AirportRow[]>;
  getAirport(exec: Executor | undefined, code: string): Promise<AirportRow | null>;
  importCsv(input: unknown): Promise<{ imported: number }>;
};
