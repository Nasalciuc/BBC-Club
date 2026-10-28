/** T1 (ADR-IMPL-077): the day `zoneDayBounds` bounds — Bun's clocks, from the ICU Bun carries — against the day
 *  Postgres reads, `(t AT TIME ZONE zone)::date`, from its own copy of the zone rules: every zone the catalogue's airports
 *  use, every day of the two years from the run. Where the two copies disagree, a dated search shows the wrong day's
 *  fares. The zones known to disagree are listed with why; any other fails. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { airports } from "@bbc/db/schema/catalog";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { zoneDayBounds } from "@bbc/shared/time-zone";

/** Zones whose next two years Bun's ICU (75.1 in Bun 1.3.4, CI's, and 1.3.14, the image's; 78.3 in 1.4.4) and Postgres's
 *  tzdata (2026e, CI's postgres:16-alpine and Postgres 16 here) read differently, measured on 28 Oct 2026. Bun is behind:
 *  a dated search in these zones bounds a day an hour off what Postgres calls that day. */
const KNOWN = new Set([
  // From 1 Nov 2026 tzdata keeps B.C., Alberta, Manitoba and the NWT on their summer offset as standard time
  // (Vancouver −07, Edmonton and Inuvik −06, Winnipeg −05); ICU still turns the clocks back.
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Inuvik",
  // tzdata: Morocco on +00 from 20 Sep 2026; ICU keeps +01 outside Ramadan.
  "Africa/Casablanca",
  "Africa/El_Aaiun",
  // tzdata: Paraguay on −03 all year; ICU 75.1 (Bun 1.3) still has its summer time end in March (ICU 78.3 agrees).
  "America/Asuncion",
]);
const DAYS = 731;

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("catalog-tz-parity", { max: 2 });
});
afterAll(() => iso.drop());

describe("zoneDayBounds against Postgres", () => {
  it("every catalogue zone, every day for two years: Bun's day is Postgres's, but in the zones known to differ", async () => {
    const zones = (
      (await iso.db.selectDistinct({ tz: airports.tz }).from(airports).orderBy(airports.tz)) as { tz: string }[]
    ).map((r) => r.tz);
    expect(zones.length).toBeGreaterThan(100);
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const days = Array.from({ length: DAYS }, (_, i) => new Date(today + i * 86_400_000).toISOString().slice(0, 10));

    const disagree = new Map<string, string>();
    for (const tz of zones) {
      const starts: string[] = [];
      const ends: string[] = [];
      for (const day of days) {
        const { start, end } = zoneDayBounds(day, tz);
        starts.push(String(start.getTime()));
        ends.push(String(end.getTime()));
      }
      // Postgres's date on both sides of each bound: the last millisecond before the start is the day before, the
      // start and the last millisecond before the end are the day, the end is the day after.
      const [first] = (await iso.db.execute(sql`
        SELECT d.day
        FROM unnest(${sql.param(days)}::text[], ${sql.param(starts)}::bigint[], ${sql.param(ends)}::bigint[]) AS d(day, s, e),
             LATERAL (SELECT timestamptz 'epoch' + d.s * interval '1 millisecond' AS s,
                             timestamptz 'epoch' + d.e * interval '1 millisecond' AS e) b
        WHERE NOT (((b.s - interval '1 millisecond') AT TIME ZONE ${tz})::date < d.day::date
               AND (b.s AT TIME ZONE ${tz})::date = d.day::date
               AND ((b.e - interval '1 millisecond') AT TIME ZONE ${tz})::date = d.day::date
               AND (b.e AT TIME ZONE ${tz})::date > d.day::date)
        ORDER BY d.day LIMIT 1`)) as unknown as { day: string }[];
      if (first) disagree.set(tz, first.day);
    }

    const unknown = [...disagree].filter(([tz]) => !KNOWN.has(tz)).map(([tz, day]) => `${tz} from ${day}`);
    expect(unknown, "zones newly disagreeing with Postgres").toEqual([]);
  }, 300_000);
});
