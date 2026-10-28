/** Quiet hours are 22:00–08:00 in the member's local timezone. Transactional bypasses this. */
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { postgresZones } from "@bbc/db/time-zones";

/** The zone a member has until they set one (members.profile.timezone's default). */
export const DEFAULT_TIME_ZONE = "America/New_York";

/** Why a member's zone was not read and the club's default stood in: the warn's `reason`. */
export type ZoneFallback = "invalid_time_zone" | "time_zone_unknown_to_postgres";

/**
 * The zones as Postgres will read them (#114): each name in the spelling Postgres lists, matched in any case (a profile
 * may hold `europe/london`), else through Intl's spelling of it (`postgresZones`); the club's default where this
 * Postgres reads no such zone — a name that is none, or one its tzdata lacks (`US/Pacific-New`; `Asia/Calcutta` without
 * tzdata-legacy) — with why, so an `AT TIME ZONE` never fails a page or a delivery and the caller logs the fallback.
 */
export async function zonesForPostgres(
  exec: Executor,
  zones: readonly string[],
): Promise<Map<string, { zone: string; fallback?: ZoneFallback }>> {
  const read = await postgresZones(exec, zones);
  const out = new Map<string, { zone: string; fallback?: ZoneFallback }>();
  for (const [tz, r] of read)
    out.set(
      tz,
      r.zone !== null
        ? { zone: r.zone }
        : {
            zone: DEFAULT_TIME_ZONE,
            fallback: r.miss === "not_a_zone" ? "invalid_time_zone" : "time_zone_unknown_to_postgres",
          },
    );
  return out;
}

/**
 * When a push from `from` may go out in each zone: `from` itself outside 22:00–08:00 local, else the next local 08:00.
 * The local clock is Postgres's, from its tzdata — the one copy of the zones' rules the club reads (#114, ADR-IMPL-077
 * §5); one statement for every zone given. Each zone is read as `zonesForPostgres` reads it — the callers have logged
 * a fallback already.
 */
export async function afterQuietHours(
  exec: Executor,
  from: Date,
  zones: readonly string[],
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  const distinct = [...new Set(zones)];
  if (distinct.length === 0) return out;
  const read = await zonesForPostgres(exec, distinct);
  const asked = distinct.map((z) => read.get(z)?.zone ?? DEFAULT_TIME_ZONE);
  const at = from.toISOString();
  const rows = (await exec.execute(sql`
    SELECT q.i, extract(epoch FROM CASE
             WHEN q.h >= 22 THEN (q.d + interval '1 day 8 hours') AT TIME ZONE q.z
             WHEN q.h < 8 THEN (q.d + interval '8 hours') AT TIME ZONE q.z
             ELSE ${at}::timestamptz END) * 1000 AS ms
    FROM (SELECT u.i, u.z,
                 extract(hour FROM ${at}::timestamptz AT TIME ZONE u.z) AS h,
                 date_trunc('day', ${at}::timestamptz AT TIME ZONE u.z) AS d
          FROM unnest(${sql.param(asked)}::text[]) WITH ORDINALITY AS u(z, i)) q`)) as unknown as {
    i: string | number;
    ms: string | number;
  }[];
  for (const r of rows) {
    const zone = distinct[Number(r.i) - 1];
    if (zone !== undefined) out.set(zone, new Date(Number(r.ms)));
  }
  return out;
}

/** `afterQuietHours` for one zone: when a push from `from` may go out there. */
export async function afterQuietHoursIn(exec: Executor, from: Date, zone: string): Promise<Date> {
  const at = (await afterQuietHours(exec, from, [zone])).get(zone);
  if (!at) throw new Error(`quiet hours: no send time for ${zone}`);
  return at;
}
