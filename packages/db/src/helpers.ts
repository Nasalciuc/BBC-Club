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

/** A schema column's name as a bare identifier (`"status"`), for hand-written SQL where the qualified
 *  `${table.column}` form (`"table"."column"`) is invalid: an aliased FROM item (`d.${col(t.status)}`), a SET target.
 *  Rename-safe like `${table.column}`: the SQL follows the Drizzle schema (scripts/check-raw-sql-columns.ts). */
export const col = (c: PgColumn): SQL => sql`${sql.identifier(c.name)}`;

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
      if (!ts || !id) return null;
      const d = new Date(ts);
      return Number.isNaN(d.getTime()) ? null : { ts: d, id };
    } catch {
      return null;
    }
  },
};

/** Guard for destructive scripts. Throws unless NODE_ENV is development or test. */
export function assertNotProduction(what: string) {
  if (process.env.NODE_ENV === "production") throw new Error(`${what} refused: NODE_ENV=production`);
}

/** What a constant may be when it is written into the SQL: a boolean, or a state's name (lower case, digits, `_`). */
const CONSTANT = /^[a-z][a-z0-9_]*$/;
function literal(value: string | boolean): SQL {
  if (typeof value === "boolean") return sql.raw(value ? "true" : "false");
  if (!CONSTANT.test(value)) throw new Error(`not a constant: ${JSON.stringify(value)}`);
  return sql.raw(`'${value}'`);
}

/**
 * `column = <constant>`, the constant written in the SQL rather than bound (ADR-IMPL-074). A partial index's predicate
 * (`WHERE published = true`, `WHERE status = 'active'`) is matched only by a literal: bound as `$1`, the generic plan
 * cannot prove it and Postgres either scans or plans the statement again at every execution (measured: E1, PR-DB).
 * Only for a constant of the code — a state or a flag — never for a value from a request.
 */
export function eqConst(column: PgColumn, value: string | boolean): SQL {
  return sql`${column} = ${literal(value)}`;
}

/** `column IN (<constants>)`, written in the SQL for the same reason as `eqConst`. */
export function inConst(column: PgColumn, values: readonly string[]): SQL {
  if (values.length === 0) throw new Error("inConst needs at least one constant");
  return sql`${column} IN (${sql.join(values.map(literal), sql`, `)})`;
}

/** Rows one retention statement deletes; the next batch is its own statement, so no delete holds a year's locks. */
export const RETENTION_BATCH = 5_000;

/**
 * DELETE the rows of `table` that `where` names, `batch` at a time, each batch its own statement — its own transaction
 * on the pool — until a batch comes back short (ADR-IMPL-077). One statement over a year of rows held its locks and
 * its WAL to the end; batches let vacuum and the writers in between. Idempotent: run twice, the second deletes what
 * aged meanwhile. `maxBatches` bounds one run; the next run carries on. Rows are picked by `ctid`, so any table works.
 * `signal` (the job's) is checked before each batch: a run past its timeout stops there, and what it deleted stays deleted.
 */
export async function deleteInBatches(
  exec: Executor,
  table: PgTable,
  where: SQL,
  opts: { batch?: number; maxBatches?: number; signal?: AbortSignal } = {},
): Promise<number> {
  const batch = opts.batch ?? RETENTION_BATCH;
  const maxBatches = opts.maxBatches ?? 200;
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    opts.signal?.throwIfAborted();
    const r = (await (exec as any).execute(
      sql`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${where} LIMIT ${sql.raw(String(batch))})`,
    )) as { count?: number; rowCount?: number };
    const n = r.count ?? r.rowCount ?? 0;
    total += n;
    if (n < batch) break;
  }
  return total;
}
