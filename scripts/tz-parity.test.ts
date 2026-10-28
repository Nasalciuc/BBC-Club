/** #114 (ADR-IMPL-077 §5): the catalogue's days and clocks, and the notifications' quiet hours and send days, are read
 *  by Postgres from its tzdata — no second copy of the zone rules (Bun's ICU fell behind tzdata 2026b in seven of the
 *  airports' zones). Here: every zone the airports use is one Postgres reads, and the day's bounds a dated search binds
 *  (fares.repo `dayStartIn`) are the instants where Postgres's own day `(t AT TIME ZONE zone)::date` begins, for every
 *  one of those zones and every day of the two years from the run. `bun run test:tz` runs it on its own after the
 *  database suites (validate, CI). */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { airports } from "../packages/db/src/schema/catalog";
import { isolatedDb, type IsolatedDb } from "../packages/db/src/testing/isolated-db";
import { dayStartIn } from "../packages/modules/domain/catalog/src/infrastructure/fares.repo";

const DAYS = 731;

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("catalog-tz-parity", { max: 2 });
});
afterAll(() => iso.drop());

async function airportZones(): Promise<string[]> {
  const rows = (await iso.db.selectDistinct({ tz: airports.tz }).from(airports).orderBy(airports.tz)) as {
    tz: string;
  }[];
  return rows.map((r) => r.tz);
}

describe("the zones' rules are Postgres's", () => {
  it("every zone the airports use is one Postgres reads (an AT TIME ZONE with it never fails a search)", async () => {
    const zones = await airportZones();
    expect(zones.length).toBeGreaterThan(100);
    const unread = (await iso.db.execute(sql`
      SELECT z FROM unnest(${sql.param(zones)}::text[]) AS z
      WHERE z NOT IN (SELECT name FROM pg_timezone_names) ORDER BY z`)) as unknown as { z: string }[];
    expect(unread.map((r) => r.z)).toEqual([]);
  });

  it("every airport zone, every day for two years: the search's bounds are where Postgres's day begins and ends", async () => {
    const zones = await airportZones();
    const today = new Date().toISOString().slice(0, 10);
    const day = sql`(${today}::date + d.i)`;
    const wrong: string[] = [];
    for (const tz of zones) {
      const start = dayStartIn(day, tz);
      const end = dayStartIn(sql`(${today}::date + d.i + 1)`, tz);
      // Postgres's date on both sides of each bound: the microsecond before the start is the day before, the start and
      // the microsecond before the end are the day, the end is the day after.
      const [first] = (await iso.db.execute(sql`
        SELECT (${today}::date + d.i)::text AS day
        FROM generate_series(0, ${DAYS - 1}) AS d(i),
             LATERAL (SELECT ${start} AS s, ${end} AS e) b
        WHERE NOT (((b.s - interval '1 microsecond') AT TIME ZONE ${tz})::date < ${day}
               AND (b.s AT TIME ZONE ${tz})::date = ${day}
               AND ((b.e - interval '1 microsecond') AT TIME ZONE ${tz})::date = ${day}
               AND (b.e AT TIME ZONE ${tz})::date > ${day})
        ORDER BY d.i LIMIT 1`)) as unknown as { day: string }[];
      if (first) wrong.push(`${tz} on ${first.day}`);
    }
    expect(wrong, "days whose bounds are not Postgres's").toEqual([]);
  }, 300_000);
});
