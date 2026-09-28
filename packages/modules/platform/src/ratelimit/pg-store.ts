import { sql } from "drizzle-orm";
import { query, type Executor } from "@bbc/db";
import { z } from "zod";

export type GcraResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
};

/** extract(epoch …) * 1000 is numeric: postgres.js returns it as text. */
const TatRow = z.object({ tat_ms: z.coerce.number() });

/** GCRA — one timestamp per key (the "theoretical arrival time"). `limit` per `periodMs`, with `burst` allowed at once.
 *  Atomic: one statement; a denied request writes nothing. SQL is the verified postgres.js statement, on the Drizzle executor. */
export async function gcraCheck(
  exec: Executor,
  key: string,
  limit: number,
  periodMs: number,
  burst: number,
  nowMs = Date.now(),
): Promise<GcraResult> {
  const T = periodMs / limit;
  const tau = T * (burst - 1);
  const inserted = await query(
    exec,
    sql`
    INSERT INTO platform.rate_limit_state AS s (key, tat) VALUES (${key}, to_timestamp(${(nowMs + T) / 1000}))
    ON CONFLICT (key) DO UPDATE
      SET tat = GREATEST(s.tat, to_timestamp(${nowMs / 1000})) + make_interval(secs => ${T / 1000})
      WHERE GREATEST(s.tat, to_timestamp(${nowMs / 1000})) - to_timestamp(${nowMs / 1000}) <= make_interval(secs => ${tau / 1000})
    RETURNING extract(epoch from tat) * 1000 AS tat_ms`,
    TatRow,
  );
  const written = inserted[0];
  if (written) {
    const tatMs = written.tat_ms;
    return {
      allowed: true,
      remaining: Math.max(0, Math.floor((tau + T - (tatMs - nowMs)) / T)),
      resetMs: Math.max(0, tatMs - nowMs),
    };
  }
  const selected = await query(
    exec,
    sql`SELECT extract(epoch from tat) * 1000 AS tat_ms FROM platform.rate_limit_state WHERE key = ${key}`,
    TatRow,
  );
  const current = selected[0];
  if (!current) throw new Error("rate_limit_state row missing after a denied GCRA check");
  const tatMs = current.tat_ms;
  return {
    allowed: false,
    remaining: 0,
    resetMs: Math.max(0, tatMs - nowMs),
    retryAfterMs: Math.max(0, Math.ceil(tatMs - tau - nowMs)),
  };
}
