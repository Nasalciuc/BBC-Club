/** ADR-IMPL-077: a dated search's day as two instants — the same day Postgres reads with `(t AT TIME ZONE zone)::date`,
 *  across a clock change, a midnight that does not exist and a zone of half and quarter hours. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { zoneDayBounds } from "@bbc/shared/time-zone";

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
  ["Asia/Kolkata", "2026-10-26"],
  ["Pacific/Chatham", "2026-09-27"],
  ["Australia/Lord_Howe", "2026-10-04"], // a half-hour change
  ["Pacific/Kiritimati", "2026-01-01"], // UTC+14
  ["Pacific/Pago_Pago", "2026-01-01"], // UTC-11
];

describe("zoneDayBounds", () => {
  it("matches Postgres's day on both sides of each bound", async () => {
    for (const [tz, day] of CASES) {
      const { start, end } = zoneDayBounds(day, tz);
      const [row] = (await iso.db.execute(sql`
        SELECT ((${start.toISOString()}::timestamptz - interval '1 millisecond') AT TIME ZONE ${tz})::date::text AS before,
               (${start.toISOString()}::timestamptz AT TIME ZONE ${tz})::date::text AS first,
               ((${end.toISOString()}::timestamptz - interval '1 millisecond') AT TIME ZONE ${tz})::date::text AS last,
               (${end.toISOString()}::timestamptz AT TIME ZONE ${tz})::date::text AS after`)) as unknown as {
        before: string;
        first: string;
        last: string;
        after: string;
      }[];
      expect(row, `${tz} ${day}`).toBeDefined();
      expect([row!.first, row!.last], `${tz} ${day}`).toEqual([day, day]);
      expect(row!.before < day && row!.after > day, `${tz} ${day}: ${row!.before} / ${row!.after}`).toBe(true);
    }
  });

  it("a day lasts as long as the zone's clock makes it", () => {
    const hours = (tz: string, day: string) => {
      const { start, end } = zoneDayBounds(day, tz);
      return (end.getTime() - start.getTime()) / 3_600_000;
    };
    expect(hours("UTC", "2026-10-26")).toBe(24);
    expect(hours("Europe/London", "2026-03-29")).toBe(23);
    expect(hours("Europe/London", "2026-10-25")).toBe(25);
    expect(hours("Australia/Lord_Howe", "2026-10-04")).toBe(23.5);
  });
});
