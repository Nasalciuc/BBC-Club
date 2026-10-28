/** ADR-IMPL-077 §5, #114: a dated search's day is the day Postgres reads, `(t AT TIME ZONE zone)::date`, by its own
 *  tzdata — across a clock change, a midnight that does not exist or comes twice, a zone of half and quarter hours, and
 *  the zones whose rules changed in 2026 — and a timed fare's clocks are read by the same tzdata. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { faresRepo } from "../../src/infrastructure/fares.repo";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("catalog-day-bounds", { max: 2 });
});
afterAll(() => iso.drop());

const CASES: [string, string][] = [
  ["UTC", "2026-10-26"],
  ["Europe/London", "2026-03-29"], // 23 hours
  ["Europe/London", "2026-10-25"], // 25 hours
  ["America/New_York", "2026-11-01"],
  ["America/Santiago", "2026-09-06"], // the clock springs forward at midnight: the day starts at 01:00
  ["America/Havana", "2026-11-01"], // the clock goes back at 01:00 to 00:00: midnight comes twice
  ["Atlantic/Azores", "2027-10-31"], // the same, an ocean away
  ["Asia/Kolkata", "2026-10-26"],
  ["Pacific/Chatham", "2026-09-27"],
  ["Australia/Lord_Howe", "2026-10-04"], // a half-hour change
  ["Pacific/Kiritimati", "2026-01-01"], // UTC+14
  ["Pacific/Pago_Pago", "2026-01-01"], // UTC-11
  ["America/Vancouver", "2026-12-15"], // B.C. on −07 all year from 1 Nov 2026
  ["Africa/Casablanca", "2027-01-15"], // Morocco on +00 from 20 Sep 2026
];

/** The day's first instant and the next day's, found by Postgres minute by minute: nothing of the search's own. */
async function scanned(tz: string, day: string): Promise<{ start: Date; end: Date }> {
  const [row] = (await iso.db.execute(sql`
    SELECT min(t) FILTER (WHERE (t AT TIME ZONE ${tz})::date = ${day}::date) AS start,
           min(t) FILTER (WHERE (t AT TIME ZONE ${tz})::date > ${day}::date) AS end
    FROM generate_series((${day}::date - 2)::timestamp AT TIME ZONE 'UTC', (${day}::date + 3)::timestamp AT TIME ZONE 'UTC',
                         interval '1 minute') AS t`)) as unknown as { start: string; end: string }[];
  return { start: new Date(row!.start), end: new Date(row!.end) };
}

/** Four timed fares on a route of their own: a minute before the day, its first minute, its last, the next day's
 *  first. */
async function faresAround(route: [string, string], b: { start: Date; end: Date }): Promise<Date[]> {
  const at = [new Date(b.start.getTime() - 60_000), b.start, new Date(b.end.getTime() - 60_000), b.end];
  for (const [i, t] of at.entries()) {
    await iso.db.execute(sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, nonstop, price, currency, source,
                                 depart_at, valid_from, valid_until, published)
      VALUES (${route[0]}, ${route[1]}, 'business', 'BA', true, ${String(100 + i)}, 'USD', 'manual',
              ${t.toISOString()}::timestamptz, now() - interval '1 day' + ${i} * interval '1 second',
              greatest(now(), ${t.toISOString()}::timestamptz) + interval '30 days', true)`);
  }
  return at;
}

describe("a dated search's day", () => {
  it("holds exactly the fares Postgres puts on that day, in every case", async () => {
    for (const [n, [tz, day]] of CASES.entries()) {
      const route: [string, string] = [`D${String.fromCharCode(65 + n)}A`, `D${String.fromCharCode(65 + n)}B`];
      const b = await scanned(tz, day);
      const at = await faresAround(route, b);
      const rows = await faresRepo.search(iso.db, {
        from: route[0],
        to: route[1],
        cabin: "business",
        when: new Date(`${day}T12:00:00Z`),
        originTz: tz,
        destTz: "UTC",
      });
      expect(rows.map((r) => r.departAt?.toISOString()).sort(), `${tz} ${day}`).toEqual(
        [at[1]!.toISOString(), at[2]!.toISOString()].sort(),
      );
      // Its clocks by the same tzdata: the first minute and the last are the day's.
      for (const r of rows) expect(r.departWall?.slice(0, 10), `${tz} ${day}`).toBe(day);
    }
  });

  it("YVR on 15 December 2026: 00:30 local is that day, at 07:30 UTC (−07, tzdata 2026b on)", async () => {
    const [row] = (await iso.db.execute(sql`
      SELECT ('2026-12-15 00:30'::timestamp AT TIME ZONE 'America/Vancouver') AS t`)) as unknown as { t: string }[];
    const t = new Date(row!.t);
    expect(t.toISOString()).toBe("2026-12-15T07:30:00.000Z");
    await iso.db.execute(sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, nonstop, price, currency, source,
                                 depart_at, valid_from, valid_until, published)
      VALUES ('YVR', 'LHR', 'business', 'BA', true, '100', 'USD', 'manual', ${t.toISOString()}::timestamptz,
              now() - interval '1 day', '2027-01-30'::timestamptz, true)`);
    const on = (day: string) =>
      faresRepo.search(iso.db, {
        from: "YVR",
        to: "LHR",
        cabin: "business",
        when: new Date(`${day}T12:00:00Z`),
        originTz: "America/Vancouver",
        destTz: "Europe/London",
      });
    const fifteenth = await on("2026-12-15");
    expect(fifteenth.map((r) => r.departWall)).toEqual(["2026-12-15T00:30"]);
    expect(await on("2026-12-14")).toEqual([]);
  });

  it("CMN on 15 January 2027: 00:30 local is 00:30 UTC (+00, tzdata 2026b on), that day", async () => {
    await iso.db.execute(sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, nonstop, price, currency, source,
                                 depart_at, valid_from, valid_until, published)
      VALUES ('CMN', 'JFK', 'business', 'AT', true, '100', 'USD', 'manual', '2027-01-15T00:30:00Z'::timestamptz,
              now() - interval '1 day', '2027-02-28'::timestamptz, true)`);
    const on = (day: string) =>
      faresRepo.search(iso.db, {
        from: "CMN",
        to: "JFK",
        cabin: "business",
        when: new Date(`${day}T12:00:00Z`),
        originTz: "Africa/Casablanca",
        destTz: "America/New_York",
      });
    expect((await on("2027-01-15")).map((r) => r.departWall)).toEqual(["2027-01-15T00:30"]);
    expect(await on("2027-01-14")).toEqual([]);
  });

  it("without the zones at hand, the day and the clocks are read per row, by the same tzdata", async () => {
    await iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity, tz) VALUES
        ('YVR', 'Vancouver International', 'Vancouver', 'Canada', 'CA', 'americas', 49.19, -123.18, 50, 'America/Vancouver'),
        ('LHR', 'Heathrow', 'London', 'United Kingdom', 'GB', 'europe', 51.47, -0.4543, 98, 'Europe/London')
      ON CONFLICT (code) DO UPDATE SET tz = EXCLUDED.tz`);
    const rows = await faresRepo.search(iso.db, {
      from: "YVR",
      to: "LHR",
      cabin: "business",
      when: new Date("2026-12-15T12:00:00Z"),
    });
    expect(rows.map((r) => r.departWall)).toEqual(["2026-12-15T00:30"]);
  });
});
