import type { Executor } from "@bbc/db";
import { sql } from "drizzle-orm";
import { sourceHolds } from "@bbc/db/schema/catalog";

export type OutsideSource = (typeof sourceHolds.$inferSelect)["source"];

/**
 * The outside sources that answered 429 (ADR-IMPL-064): Wikimedia's Retry-After, kept so that neither Wikimedia job asks
 * again before it ends — the place photos' job, every minute, and the landmarks' job. One row a source.
 */
export const sourceHoldsRepo = {
  /** Holds `source` for `seconds` from now; a hold already longer stays as it is. */
  async hold(exec: Executor, source: OutsideSource, seconds: number): Promise<void> {
    const until = sql`now() + make_interval(secs => ${Math.max(1, Math.ceil(seconds))})`;
    await exec
      .insert(sourceHolds)
      .values({ source, notBefore: until })
      .onConflictDoUpdate({
        target: sourceHolds.source,
        set: { notBefore: sql`greatest(${sourceHolds.notBefore}, ${until})` },
      });
  },

  /** The seconds until the last hold still on ends; null when no source is held. */
  async heldFor(exec: Executor): Promise<number | null> {
    const [row] = await exec
      .select({
        seconds: sql<number | null>`ceil(extract(epoch FROM max(${sourceHolds.notBefore}) - now()))::int`.mapWith(
          (v: unknown) => (v === null ? null : Number(v)),
        ),
      })
      .from(sourceHolds)
      .where(sql`${sourceHolds.notBefore} > now()`);
    return row?.seconds ?? null;
  },
};
