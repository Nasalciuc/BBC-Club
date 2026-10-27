import type { Executor } from "@bbc/db";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { demandDaily } from "@bbc/db/schema/catalog";

/** Discovery's reads (ADR-IMPL-039); the hubs and a zone's busiest airports come from memory (ADR-IMPL-075). Search counts are used here to choose and to order — they never leave. */
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
};
