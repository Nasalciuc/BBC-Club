/**
 * The zone names Postgres reads (#114, ADR-IMPL-077 §5): the club reads a zone's rules from Postgres's tzdata, so a name
 * is good when Postgres reads it, and stored in the spelling Postgres lists. Postgres reads a name in any case
 * (`europe/london` is London); `pg_timezone_names` is how the club learns which names it reads at all — a tzdata
 * without Debian's tzdata-legacy has no `Asia/Calcutta`, none has `US/Pacific-New`, and ICU still takes both. An old
 * name Postgres lacks is read as the zone tzdata links it to (`tz-links.ts`, generated from tzdata.zi): Android
 * phones report `Asia/Calcutta`.
 */
import { sql } from "drizzle-orm";
import type { Executor } from "./client";
import { TZ_LINKS } from "./tz-links";

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

/** tzdata's links by the alias's lower case: `asia/calcutta` → `Asia/Kolkata`. */
const LINKS = new Map(Object.entries(TZ_LINKS).map(([alias, target]) => [alias.toLowerCase(), target]));

/** Why a name is not one this Postgres reads: no zone at all, or a zone Intl reads and this Postgres's tzdata lacks. */
export type ZoneMiss = "not_a_zone" | "unknown_to_postgres";
export type PostgresZone = { zone: string; miss?: undefined } | { zone: null; miss: ZoneMiss };

/**
 * One name against the names a Postgres lists (by lower case): its own spelling there, the name matched in any case;
 * else Intl's spelling of it, matched the same way; else the zone tzdata links it to (`Asia/Calcutta` → `Asia/Kolkata`,
 * `US/Eastern` → `America/New_York`), when this Postgres reads that; else a miss, and why. A name Postgres lists is
 * kept as it lists it (`Europe/Bratislava` stays, though tzdata now links it to Prague): a link stands in only for a
 * name Postgres cannot read.
 */
export function resolveZone(names: ReadonlyMap<string, string>, tz: string): PostgresZone {
  const own = names.get(tz.toLowerCase());
  if (own) return { zone: own };
  const intl = intlSpelling(tz);
  const viaIntl = intl ? names.get(intl.toLowerCase()) : undefined;
  if (viaIntl) return { zone: viaIntl };
  const linked = LINKS.get(tz.toLowerCase()) ?? (intl ? LINKS.get(intl.toLowerCase()) : undefined);
  const viaLink = linked ? names.get(linked.toLowerCase()) : undefined;
  if (viaLink) return { zone: viaLink };
  return { zone: null, miss: intl || linked ? "unknown_to_postgres" : "not_a_zone" };
}

/** Each name as this Postgres reads it (`resolveZone`). One read of its list per process. */
export async function postgresZones(exec: Executor, zones: readonly string[]): Promise<Map<string, PostgresZone>> {
  const out = new Map<string, PostgresZone>();
  if (zones.length === 0) return out;
  const names = await listedNames(exec);
  for (const tz of zones) if (!out.has(tz)) out.set(tz, resolveZone(names, tz));
  return out;
}

/** `postgresZones` for one name. */
export async function postgresZone(exec: Executor, tz: string): Promise<PostgresZone> {
  return (await postgresZones(exec, [tz])).get(tz) ?? { zone: null, miss: "not_a_zone" };
}
