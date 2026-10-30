import { asc, desc } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import type { ModulePlatform } from "@bbc/shared/module-contract";
import { airports } from "@bbc/db/schema/catalog";
import { airportsRepo } from "../infrastructure/airports.repo";

type Row = typeof airports.$inferSelect;
type Held = { byCode: ReadonlyMap<string, Row>; busiestFirst: readonly Row[] };

/** Distinct texts typed into the airport search kept per process; the oldest goes first past it. */
export const TYPEAHEAD_ENTRIES = 5_000;

/**
 * The airports, held whole in each process and loaded again when `catalog.airports`' generation moves — an import, the
 * reference load at migrate, a fix in psql (ADR-IMPL-075). About 3 900 rows, a few megabytes: every read by code, the
 * hubs and the busiest airports of a time zone answer from memory. The typeahead keeps each text's answer for the
 * generation, computed by ADR-IMPL-036's query on a miss. A transaction that must see its own writes reads the table
 * through `airportsRepo`, not here.
 */
export function createAirportsReference(reference: ModulePlatform["reference"], conn: Executor) {
  const snapshot = reference.snapshot<Held>(
    "catalog.airports",
    async () => {
      const rows = await conn.select().from(airports).orderBy(desc(airports.popularity), asc(airports.code));
      return { byCode: new Map(rows.map((r) => [r.code.trim(), r])), busiestFirst: rows };
    },
    { ns: "catalog.airports" },
  );
  const typeahead = reference.memo<Row[]>("catalog.airports", {
    maxEntries: TYPEAHEAD_ENTRIES,
    ns: "catalog.typeahead",
  });

  return {
    async get(code: string): Promise<Row | null> {
      return (await snapshot.get()).byCode.get(code.trim().toUpperCase()) ?? null;
    },
    /** Each code's airport once, in the order asked; unknown codes are left out. */
    async getMany(codes: readonly string[]): Promise<Row[]> {
      const { byCode } = await snapshot.get();
      const seen = new Set<string>();
      return codes.flatMap((c) => {
        const code = c.trim().toUpperCase();
        const row = byCode.get(code);
        if (!row || seen.has(code)) return [];
        seen.add(code);
        return [row];
      });
    },
    /** The club's busiest airports, the curated hubs first (their popularity is 40–100, every other airport's below). */
    async hubs(limit: number): Promise<Row[]> {
      return (await snapshot.get()).busiestFirst.slice(0, limit);
    },
    /** Every airport of these zones with the top popularity among them, by code (at most 50). */
    async busiestIn(zones: readonly string[]): Promise<Row[]> {
      const wanted = new Set(zones);
      const inZones = (await snapshot.get()).busiestFirst.filter((a) => wanted.has(a.tz));
      const top = inZones[0]?.popularity;
      return inZones
        .filter((a) => a.popularity === top)
        .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
        .slice(0, 50);
    },
    /** ADR-IMPL-036's search, kept per typed text (trimmed, lower case) for the airports' generation. */
    search(q: string): Promise<Row[]> {
      const key = q.trim().toLowerCase();
      if (!key) return Promise.resolve([]);
      return typeahead.get(key, () => airportsRepo.search(conn, q));
    },
  };
}
export type AirportsReference = ReturnType<typeof createAirportsReference>;
