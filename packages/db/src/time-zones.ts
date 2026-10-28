/**
 * The zone names Postgres reads (#114, ADR-IMPL-077 §5): the club reads a zone's rules from Postgres's tzdata, so a name
 * is good when Postgres reads it, and stored in the spelling Postgres lists. Postgres reads a name in any case
 * (`europe/london` is London); `pg_timezone_names` is how the club learns which names it reads at all — a tzdata
 * without Debian's tzdata-legacy has no `Asia/Calcutta`, none has `US/Pacific-New`, and ICU still takes both.
 */
import { sql } from "drizzle-orm";
import type { Executor } from "./client";

/** Each name Postgres lists, by its lower case: read once per process (about 50 ms to list), again after a failure. */
let listed: Promise<Map<string, string>> | null = null;

function listedNames(exec: Executor): Promise<Map<string, string>> {
  // The view's first column, renamed by the alias: `name` written bare reads as one of the club's columns to
  // scripts/check-raw-sql-columns.ts.
  listed ??= (exec.execute(sql`SELECT z.zone FROM pg_timezone_names AS z(zone)`) as Promise<{ zone: string }[]>).then(
    (rows) => new Map(rows.map((r) => [r.zone.toLowerCase(), r.zone])),
    (err: unknown) => {
      listed = null;
      throw err;
    },
  );
  return listed;
}

/** A zone's name, as `isIanaZone` (packages/shared) takes it: letters first, never an offset such as `+05:00`, which
 *  Intl may read as a zone. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/** Intl's spelling of a zone's name (`europe/london` → `Europe/London`; an engine that resolves aliases, `US/Eastern` →
 *  `America/New_York`), or null where it is no name or Intl reads no such zone. */
function intlSpelling(tz: string): string | null {
  if (!ZONE_NAME.test(tz)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Why a name is not one this Postgres reads: no zone at all, or a zone Intl reads and this Postgres's tzdata lacks. */
export type ZoneMiss = "not_a_zone" | "unknown_to_postgres";
export type PostgresZone = { zone: string; miss?: undefined } | { zone: null; miss: ZoneMiss };

/**
 * Each name as Postgres reads it: its spelling in `pg_timezone_names`, the name matched in any case; else Intl's
 * spelling of it, matched the same way; else a miss, and why. One read of the list per process.
 */
export async function postgresZones(exec: Executor, zones: readonly string[]): Promise<Map<string, PostgresZone>> {
  const out = new Map<string, PostgresZone>();
  if (zones.length === 0) return out;
  const names = await listedNames(exec);
  for (const tz of zones) {
    if (out.has(tz)) continue;
    const own = names.get(tz.toLowerCase());
    if (own) {
      out.set(tz, { zone: own });
      continue;
    }
    const intl = intlSpelling(tz);
    const viaIntl = intl ? names.get(intl.toLowerCase()) : undefined;
    out.set(tz, viaIntl ? { zone: viaIntl } : { zone: null, miss: intl ? "unknown_to_postgres" : "not_a_zone" });
  }
  return out;
}

/** `postgresZones` for one name. */
export async function postgresZone(exec: Executor, tz: string): Promise<PostgresZone> {
  return (await postgresZones(exec, [tz])).get(tz) ?? { zone: null, miss: "not_a_zone" };
}
