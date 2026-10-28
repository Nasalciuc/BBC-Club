/** #114 (ADR-IMPL-077 §5): quiet hours and the daily cap's day read the member's clock from Postgres's tzdata, the copy
 *  of the zones' rules the catalogue reads too. Vancouver keeps −07 from 1 Nov 2026 by tzdata; a runtime whose rules
 *  still turn its clocks back would read an hour earlier there. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { afterQuietHours, DEFAULT_TIME_ZONE, zonesForPostgres } from "../../src/application/quiet-hours";
import { localDays } from "../../src/application/daily-cap";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("notifications-quiet-hours", { max: 2 });
});
afterAll(() => iso.drop());

describe("quiet hours, by Postgres's clocks", () => {
  it("08:30 in Vancouver on 15 December 2026 (15:30 UTC, −07) is awake: the push goes now", async () => {
    const at = new Date("2026-12-15T15:30:00Z");
    expect((await afterQuietHours(iso.db, at, ["America/Vancouver"])).get("America/Vancouver")?.toISOString()).toBe(
      at.toISOString(),
    );
  });

  it("inside quiet hours, the next local 08:00: tonight's and this morning's, across a clock change", async () => {
    const out = await afterQuietHours(iso.db, new Date("2026-10-25T00:30:00Z"), [
      "Europe/London", // 01:30 BST on the day the clock goes back: 08:00 GMT is 08:00 UTC
      "America/New_York", // 20:30 the evening before: awake
      "Asia/Tokyo", // 09:30: awake
      "Asia/Kolkata", // 06:00: 08:00 IST is 02:30 UTC
    ]);
    expect(Object.fromEntries([...out].map(([z, d]) => [z, d.toISOString()]))).toEqual({
      "Europe/London": "2026-10-25T08:00:00.000Z",
      "America/New_York": "2026-10-25T00:30:00.000Z",
      "Asia/Tokyo": "2026-10-25T00:30:00.000Z",
      "Asia/Kolkata": "2026-10-25T02:30:00.000Z",
    });
    // 23:00 in New York: 08:00 the next day there.
    const late = await afterQuietHours(iso.db, new Date("2026-09-28T03:00:00Z"), ["America/New_York"]);
    expect(late.get("America/New_York")?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("the daily cap's day: 00:30 on 16 December in Vancouver is the 16th; each instant in its own zone", async () => {
    expect(
      await localDays(iso.db, [
        { at: new Date("2026-12-16T07:30:00Z"), timeZone: "America/Vancouver" },
        { at: new Date("2026-12-16T07:30:00Z"), timeZone: "Europe/London" },
        { at: new Date("2027-01-15T00:30:00Z"), timeZone: "Africa/Casablanca" },
      ]),
    ).toEqual(["2026-12-16", "2026-12-16", "2027-01-15"]);
  });

  it("a zone in another case is that zone: 23:30 in London, written europe/london, is quiet until 08:00 there", async () => {
    // 28 October 2026, GMT: 23:30 UTC is 23:30 in London and 19:30 in New York, the club's default.
    const at = new Date("2026-10-28T23:30:00Z");
    const out = await afterQuietHours(iso.db, at, ["Europe/London", "europe/london", "EUROPE/LONDON"]);
    expect(Object.fromEntries([...out].map(([z, d]) => [z, d.toISOString()]))).toEqual({
      "Europe/London": "2026-10-29T08:00:00.000Z",
      "europe/london": "2026-10-29T08:00:00.000Z",
      "EUROPE/LONDON": "2026-10-29T08:00:00.000Z",
    });
    // 03:30 UTC on the 29th is the 29th in London, still the 28th in New York.
    const early = new Date("2026-10-29T03:30:00Z");
    expect(
      await localDays(iso.db, [
        { at: early, timeZone: "Europe/London" },
        { at: early, timeZone: "europe/london" },
      ]),
    ).toEqual(["2026-10-29", "2026-10-29"]);
  });

  it("a zone Postgres does not read is the club's default, said why: no zone at all, or one Intl takes and tzdata lacks", async () => {
    // US/Pacific-New: gone from tzdata in 2020b, still taken by ICU (and so by the profile's rule before #114's fix).
    const read = await zonesForPostgres(iso.db, ["europe/london", "US/Pacific-New", "Not/AZone"]);
    expect(Object.fromEntries(read)).toEqual({
      "europe/london": { zone: "Europe/London" },
      "US/Pacific-New": { zone: DEFAULT_TIME_ZONE, fallback: "time_zone_unknown_to_postgres" },
      "Not/AZone": { zone: DEFAULT_TIME_ZONE, fallback: "invalid_time_zone" },
    });
    // The statement never fails on it: 23:00 in New York waits for 08:00 there.
    const out = await afterQuietHours(iso.db, new Date("2026-09-28T03:00:00Z"), ["US/Pacific-New"]);
    expect(out.get("US/Pacific-New")?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });
});
