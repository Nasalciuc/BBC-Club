/** The zone names Postgres reads (#114, ADR-IMPL-077 §5): what the profile stores and quiet hours read. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";
import { postgresZone, postgresZones } from "../src/time-zones";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-time-zones", { max: 2 });
});
afterAll(() => iso.drop());

describe("Postgres's zone names", () => {
  it("a zone in any case is the zone, in the spelling Postgres lists", async () => {
    const read = await postgresZones(iso.db, ["Europe/London", "europe/london", "EUROPE/LONDON", "utc", "etc/gmt+5"]);
    expect(Object.fromEntries(read)).toEqual({
      "Europe/London": { zone: "Europe/London" },
      "europe/london": { zone: "Europe/London" },
      "EUROPE/LONDON": { zone: "Europe/London" },
      utc: { zone: "UTC" },
      "etc/gmt+5": { zone: "Etc/GMT+5" },
    });
  });

  it("a miss says why: no zone at all, or one Intl takes that this Postgres's tzdata lacks", async () => {
    // US/Pacific-New left tzdata in 2020b; ICU still takes it.
    expect(await postgresZone(iso.db, "US/Pacific-New")).toEqual({ zone: null, miss: "unknown_to_postgres" });
    for (const tz of ["Not/AZone", "", "+05:00", " Europe/London"])
      expect(await postgresZone(iso.db, tz)).toEqual({ zone: null, miss: "not_a_zone" });
  });
});
