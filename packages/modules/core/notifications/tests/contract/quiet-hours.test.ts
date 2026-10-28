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

  it("a zone name Postgres does not read counts as the club's default, never failing the statement", async () => {
    const read = await zonesForPostgres(iso.db, ["Europe/London", "Mars/Olympus_Mons"]);
    expect(read.get("Europe/London")).toBe("Europe/London");
    expect(read.get("Mars/Olympus_Mons")).toBe(DEFAULT_TIME_ZONE);
    const out = await afterQuietHours(iso.db, new Date("2026-09-28T03:00:00Z"), ["Mars/Olympus_Mons"]);
    expect(out.get("Mars/Olympus_Mons")?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });
});
