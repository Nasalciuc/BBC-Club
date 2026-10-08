import type { Executor } from "@bbc/db";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { airports, demandDaily } from "@bbc/db/schema/catalog";

/** Discovery's reads (ADR-IMPL-039). Search counts are used here to choose and to order — they never leave. */
export const discoveryRepo = {
  /** Destinations searched at least `min` times from `from` since `since` (all cabins together), busiest first. */
  async searchedFrom(exec: Executor, from: string, since: Date, min: number, limit: number): Promise<string[]> {
    const searches = sql<number>`sum(${demandDaily.searches})`;
    const rows = await exec
      .select({ to: demandDaily.routeTo })
      .from(demandDaily)
      .where(and(eq(demandDaily.routeFrom, from), gte(demandDaily.day, since)))
      .groupBy(demandDaily.routeTo)
      .having(sql`${searches} >= ${min}`)
      .orderBy(desc(searches), asc(demandDaily.routeTo))
      .limit(limit);
    return rows.map((r) => r.to);
  },

  /** The club's busiest airports: the curated hubs lead (their popularity is 40–100, every other airport's below). */
  async hubs(exec: Executor, limit: number) {
    return exec.select().from(airports).orderBy(desc(airports.popularity), asc(airports.code)).limit(limit);
  },

  /** The busiest airport in one of these time zones, or null. */
  async busiestIn(exec: Executor, zones: string[]) {
    const [row] = await exec
      .select()
      .from(airports)
      .where(inArray(airports.tz, zones))
      .orderBy(desc(airports.popularity), asc(airports.code))
      .limit(1);
    return row ?? null;
  },
};
