/**
 * The member's local clock, read by Postgres from its tzdata — the one copy of the zones' rules the club reads (#114,
 * ADR-IMPL-077 §5). One statement for any number of zones; every zone given is one Postgres reads (the application
 * reads each through `zonesForPostgres` first, so an `AT TIME ZONE` here never fails).
 */
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";

/** For each zone, in order: when a push from `from` may go out there — `from` itself outside 22:00–08:00 local, else
 *  the next local 08:00 (tonight's or this morning's). */
export async function quietHoursEndIn(exec: Executor, from: Date, zones: readonly string[]): Promise<Date[]> {
  if (zones.length === 0) return [];
  const at = from.toISOString();
  const rows = (await exec.execute(sql`
    SELECT q.i, extract(epoch FROM CASE
             WHEN q.h >= 22 THEN (q.d + interval '1 day 8 hours') AT TIME ZONE q.z
             WHEN q.h < 8 THEN (q.d + interval '8 hours') AT TIME ZONE q.z
             ELSE ${at}::timestamptz END) * 1000 AS ms
    FROM (SELECT u.i, u.z,
                 extract(hour FROM ${at}::timestamptz AT TIME ZONE u.z) AS h,
                 date_trunc('day', ${at}::timestamptz AT TIME ZONE u.z) AS d
          FROM unnest(${sql.param([...zones])}::text[]) WITH ORDINALITY AS u(z, i)) q`)) as unknown as {
    i: string | number;
    ms: string | number;
  }[];
  const out: Date[] = new Array(zones.length);
  for (const r of rows) out[Number(r.i) - 1] = new Date(Number(r.ms));
  return out;
}

/** For each instant, in order: the calendar day it falls on in its zone (`2026-10-26`). The instants are bound as ISO
 *  text (postgres.js binds a text[], not a timestamptz[]); the day as to_char writes it, whatever the session's
 *  DateStyle. */
export async function calendarDaysIn(exec: Executor, at: readonly { at: Date; zone: string }[]): Promise<string[]> {
  if (at.length === 0) return [];
  const rows = (await exec.execute(sql`
    SELECT u.i, to_char(u.t AT TIME ZONE u.z, 'YYYY-MM-DD') AS local_day
    FROM unnest(${sql.param(at.map((a) => a.at.toISOString()))}::text[]::timestamptz[],
                ${sql.param(at.map((a) => a.zone))}::text[]) WITH ORDINALITY AS u(t, z, i)`)) as unknown as {
    i: string | number;
    local_day: string;
  }[];
  const days: string[] = new Array(at.length);
  for (const r of rows) days[Number(r.i) - 1] = r.local_day;
  return days;
}
