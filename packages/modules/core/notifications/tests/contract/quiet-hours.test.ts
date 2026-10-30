/** #114 (ADR-IMPL-077 §5): quiet hours and the daily cap's day read the member's clock from Postgres's tzdata, the copy
 *  of the zones' rules the catalogue reads too. Vancouver keeps −07 from 1 Nov 2026 by tzdata; a runtime whose rules
 *  still turn its clocks back would read an hour earlier there. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { DEFAULT_TIME_ZONE, sendTimes, zonesForPostgres, type SendTime } from "../../src/application/quiet-hours";
import { offerSendsSelect } from "../../src/application/daily-cap";

/** The send times as ISO text, by zone. */
const iso8601 = (out: Map<string, SendTime>) =>
  Object.fromEntries(
    [...out].map(([z, t]) => [
      z,
      { sendAt: t.sendAt.toISOString(), sendDay: t.sendDay, day: [t.dayStart.toISOString(), t.dayEnd.toISOString()] },
    ]),
  );
const sendAt = async (at: Date, zone: string) => (await sendTimes(iso.db, at, [zone])).get(zone)?.sendAt.toISOString();

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("notifications-quiet-hours", { max: 2 });
});
afterAll(() => iso.drop());

describe("quiet hours, by Postgres's clocks", () => {
  it("08:30 in Vancouver on 15 December 2026 (15:30 UTC, −07) is awake: the push goes now", async () => {
    const at = new Date("2026-12-15T15:30:00Z");
    expect(await sendAt(at, "America/Vancouver")).toBe(at.toISOString());
  });

  it("inside quiet hours, the next local 08:00: tonight's and this morning's, across a clock change", async () => {
    const out = await sendTimes(iso.db, new Date("2026-10-25T00:30:00Z"), [
      "Europe/London", // 01:30 BST on the day the clock goes back: 08:00 GMT is 08:00 UTC
      "America/New_York", // 20:30 the evening before: awake
      "Asia/Tokyo", // 09:30: awake
      "Asia/Kolkata", // 06:00: 08:00 IST is 02:30 UTC
    ]);
    expect(iso8601(out)).toEqual({
      // Its day is 25 hours: 00:00 BST (23:00 UTC the evening before) to 00:00 GMT.
      "Europe/London": {
        sendAt: "2026-10-25T08:00:00.000Z",
        sendDay: "2026-10-25",
        day: ["2026-10-24T23:00:00.000Z", "2026-10-26T00:00:00.000Z"],
      },
      "America/New_York": {
        sendAt: "2026-10-25T00:30:00.000Z",
        sendDay: "2026-10-24",
        day: ["2026-10-24T04:00:00.000Z", "2026-10-25T04:00:00.000Z"],
      },
      "Asia/Tokyo": {
        sendAt: "2026-10-25T00:30:00.000Z",
        sendDay: "2026-10-25",
        day: ["2026-10-24T15:00:00.000Z", "2026-10-25T15:00:00.000Z"],
      },
      "Asia/Kolkata": {
        sendAt: "2026-10-25T02:30:00.000Z",
        sendDay: "2026-10-25",
        day: ["2026-10-24T18:30:00.000Z", "2026-10-25T18:30:00.000Z"],
      },
    });
    // 23:00 in New York: 08:00 the next day there.
    expect(await sendAt(new Date("2026-09-28T03:00:00Z"), "America/New_York")).toBe("2026-09-28T12:00:00.000Z");
  });

  it("the daily cap's day: 00:30 on 16 December in Vancouver is quiet, and the push goes at 08:00 on the 16th", async () => {
    // 07:30 UTC: 00:30 in Vancouver (−07 all year from 1 Nov 2026), 07:30 in London; 00:30 in Casablanca (+00).
    expect(
      iso8601(await sendTimes(iso.db, new Date("2026-12-16T07:30:00Z"), ["America/Vancouver", "Europe/London"])),
    ).toEqual({
      "America/Vancouver": {
        sendAt: "2026-12-16T15:00:00.000Z",
        sendDay: "2026-12-16",
        day: ["2026-12-16T07:00:00.000Z", "2026-12-17T07:00:00.000Z"],
      },
      "Europe/London": {
        sendAt: "2026-12-16T08:00:00.000Z",
        sendDay: "2026-12-16",
        day: ["2026-12-16T00:00:00.000Z", "2026-12-17T00:00:00.000Z"],
      },
    });
    expect(iso8601(await sendTimes(iso.db, new Date("2027-01-15T00:30:00Z"), ["Africa/Casablanca"]))).toEqual({
      "Africa/Casablanca": {
        sendAt: "2027-01-15T08:00:00.000Z",
        sendDay: "2027-01-15",
        day: ["2027-01-15T00:00:00.000Z", "2027-01-16T00:00:00.000Z"],
      },
    });
  });

  it("a zone in another case is that zone: 23:30 in London, written europe/london, is quiet until 08:00 there", async () => {
    // 28 October 2026, GMT: 23:30 UTC is 23:30 in London and 19:30 in New York, the club's default.
    const at = new Date("2026-10-28T23:30:00Z");
    const out = await sendTimes(iso.db, at, ["Europe/London", "europe/london", "EUROPE/LONDON"]);
    const london = {
      sendAt: "2026-10-29T08:00:00.000Z",
      sendDay: "2026-10-29",
      day: ["2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z"],
    };
    expect(iso8601(out)).toEqual({ "Europe/London": london, "europe/london": london, "EUROPE/LONDON": london });
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
    expect(await sendAt(new Date("2026-09-28T03:00:00Z"), "US/Pacific-New")).toBe("2026-09-28T12:00:00.000Z");
  });
});

describe("the daily cap's read of a page's pushes", () => {
  it("is one statement text for a page of one member and a page of three: the members are one array", () => {
    const text = (n: number) =>
      offerSendsSelect(
        iso.db,
        Array.from({ length: n }, (_, i) => `m${i}`),
        new Date("2026-10-28T00:00:00Z"),
        new Date("2026-10-29T00:00:00Z"),
      ).toSQL().sql;
    expect(text(3)).toBe(text(1));
    expect(text(1)).toMatch(/= ANY\(\$\d+::text\[\]\)/);
  });
});
