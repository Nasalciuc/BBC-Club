import { sql, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { Executor } from "./client";

/** Atomic counter: INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING.
 *  The ATS Hero lesson: never SELECT then UPDATE a counter. `cap` makes it a reservation (returns null when exhausted). */
export async function bumpCounter(
  exec: Executor,
  table: PgTable,
  keys: Record<string, unknown>,
  counter: PgColumn,
  conflictTarget: PgColumn[],
  cap?: number,
): Promise<number | null> {
  const rows = await (exec as any)
    .insert(table)
    .values({ ...keys, [counter.name]: 1 })
    .onConflictDoUpdate({
      target: conflictTarget,
      set: { [counter.name]: sql`${counter} + 1` },
      ...(cap !== undefined ? { setWhere: sql`${counter} < ${cap}` } : {}),
    })
    .returning({ value: counter });
  return rows[0]?.value ?? null;
}

/** Postgres advisory lock scoped to the current transaction. Returns false if another holder exists.
 *  Used by the poller and the dispatcher so two API instances never process the same queue. */
export async function tryAdvisoryXactLock(exec: Executor, key: string): Promise<boolean> {
  const rows = await (exec as any).execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS ok`);
  return Boolean(rows[0]?.ok);
}

/** SKIP LOCKED fetch for queue tables: caller passes the table, the predicate and the order. */
export function forUpdateSkipLocked(limit: number): SQL {
  return sql`FOR UPDATE SKIP LOCKED LIMIT ${limit}`;
}

/** Cursor pagination helper for (published_at, id) keysets — opaque to the client. */
export const cursor = {
  encode: (ts: Date, id: string) => Buffer.from(`${ts.toISOString()}|${id}`).toString("base64url"),
  decode: (c: string): { ts: Date; id: string } | null => {
    try {
      const [ts, id] = Buffer.from(c, "base64url").toString().split("|");
      const d = new Date(ts);
      return Number.isNaN(d.getTime()) || !id ? null : { ts: d, id };
    } catch {
      return null;
    }
  },
};

/** Guard for destructive scripts. Throws unless NODE_ENV is development or test. */
export function assertNotProduction(what: string) {
  if (process.env.NODE_ENV === "production") throw new Error(`${what} refused: NODE_ENV=production`);
}
