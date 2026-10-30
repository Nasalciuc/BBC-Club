/**
 * The member's local clock, read by Postgres from its tzdata — the one copy of the zones' rules the club reads (#114,
 * ADR-IMPL-077 §5). One statement for any number of zones; every zone given is one Postgres reads (the application
 * reads each through `zonesForPostgres` first, so an `AT TIME ZONE` here never fails).
 */
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { dayStartIn } from "@bbc/db/time-zones";

/** When a push from a moment may go out in a zone, and the local day it goes out on. */
export type SendTime = {
  /** The moment itself outside 22:00–08:00 local, else the next local 08:00 (tonight's or this morning's). */
  sendAt: Date;
  /** The local calendar day of `sendAt` (`2026-10-29`). */
  sendDay: string;
  /** That day's first instant in the zone, and the next day's: a push scheduled in [dayStart, dayEnd) is on it. */
  dayStart: Date;
  dayEnd: Date;
};

/**
 * For each zone, in order, its `SendTime` for a push from `from`: the quiet hours' end, its day and the day's bounds
 * (`dayStartIn`, the bounds a dated search reads), in one statement over the zones given — a page's zones, not its
 * members: the send time depends on the zone alone.
 */
export async function sendTimesIn(exec: Executor, from: Date, zones: readonly string[]): Promise<SendTime[]> {
  if (zones.length === 0) return [];
  const at = from.toISOString();
  // The send's local date and the next, in the row's zone: their first instants bound the send's day.
  const zone = sql`q.z`;
  const dayStart = dayStartIn(sql`(q.send AT TIME ZONE q.z)::date`, zone);
  const dayEnd = dayStartIn(sql`(q.send AT TIME ZONE q.z)::date + 1`, zone);
  const rows = (await exec.execute(sql`
    SELECT q.i,
           extract(epoch FROM q.send) * 1000 AS send_ms,
           to_char(q.send AT TIME ZONE q.z, 'YYYY-MM-DD') AS send_day,
           extract(epoch FROM ${dayStart}) * 1000 AS start_ms,
           extract(epoch FROM ${dayEnd}) * 1000 AS end_ms
    FROM (SELECT p.i, p.z, CASE
                   WHEN p.h >= 22 THEN (p.d + interval '1 day 8 hours') AT TIME ZONE p.z
                   WHEN p.h < 8 THEN (p.d + interval '8 hours') AT TIME ZONE p.z
                   ELSE ${at}::timestamptz END AS send
          FROM (SELECT u.i, u.z,
                       extract(hour FROM ${at}::timestamptz AT TIME ZONE u.z) AS h,
                       date_trunc('day', ${at}::timestamptz AT TIME ZONE u.z) AS d
                FROM unnest(${sql.param([...zones])}::text[]) WITH ORDINALITY AS u(z, i)) p) q`)) as unknown as {
    i: string | number;
    send_ms: string | number;
    send_day: string;
    start_ms: string | number;
    end_ms: string | number;
  }[];
  const out: SendTime[] = new Array(zones.length);
  for (const r of rows)
    out[Number(r.i) - 1] = {
      sendAt: new Date(Number(r.send_ms)),
      sendDay: r.send_day,
      dayStart: new Date(Number(r.start_ms)),
      dayEnd: new Date(Number(r.end_ms)),
    };
  return out;
}
