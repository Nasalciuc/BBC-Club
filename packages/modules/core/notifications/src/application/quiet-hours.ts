/** Quiet hours are 22:00–08:00 in the member's local timezone. Transactional bypasses this. */
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { isIanaZone } from "@bbc/shared/time-zone";

/** The zone a member has until they set one (members.profile.timezone's default). */
export const DEFAULT_TIME_ZONE = "America/New_York";

/** An IANA zone name the profile accepts (`Europe/London`): the shared rule (ADR-IMPL-075), the app's too. */
export const isTimeZone = isIanaZone;

/**
 * The member's zone when it is one, else the club's default. A value stored before zones were checked, or any bad row,
 * must never fail a delivery or a page of a campaign: `onInvalid` says so (the caller logs it, with the member).
 */
export function safeTimeZone(tz: string | null | undefined, onInvalid?: () => void): string {
  if (tz && isTimeZone(tz)) return tz;
  onInvalid?.();
  return DEFAULT_TIME_ZONE;
}

/** The zone names this Postgres reads (`pg_timezone_names`, about 50 ms to list): read once per process. */
let postgresZones: Promise<Set<string>> | null = null;

/**
 * The zones as Postgres will read them (#114): each one, or the club's default where Postgres's tzdata has no such name
 * (a name the profile accepted from the app's rule), so an `AT TIME ZONE` with it never fails a page or a delivery.
 */
export async function zonesForPostgres(exec: Executor, zones: readonly string[]): Promise<Map<string, string>> {
  // The view's first column, renamed by the alias: `name` written bare reads as one of the club's columns to
  // scripts/check-raw-sql-columns.ts.
  postgresZones ??= (
    exec.execute(sql`SELECT z.zone FROM pg_timezone_names AS z(zone)`) as Promise<{ zone: string }[]>
  ).then(
    (rows) => new Set(rows.map((r) => r.zone)),
    (err: unknown) => {
      postgresZones = null;
      throw err;
    },
  );
  const known = await postgresZones;
  return new Map(zones.map((z) => [z, known.has(z) ? z : DEFAULT_TIME_ZONE]));
}

/**
 * When a push from `from` may go out in each zone: `from` itself outside 22:00–08:00 local, else the next local 08:00.
 * The local clock is Postgres's, from its tzdata — the one copy of the zones' rules the club reads (#114, ADR-IMPL-077
 * §5); one statement for every zone given. Zones are `safeTimeZone`'s answers; one Postgres cannot read counts as the
 * club's default.
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
  const asked = distinct.map((z) => read.get(z) ?? DEFAULT_TIME_ZONE);
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
