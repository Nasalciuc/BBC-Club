/** The zone names Postgres reads (#114, ADR-IMPL-077 §5): what the profile stores and quiet hours read. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { linksOf } from "../scripts/tz-links";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";
import { postgresZone, postgresZones, resolveZone } from "../src/time-zones";
import { TZ_LINKS, TZ_LINKS_TZDATA } from "../src/tz-links";

/** Old names phones still report, and the zone tzdata links each to. */
const OLD_NAMES: [string, string][] = [
  ["Asia/Calcutta", "Asia/Kolkata"],
  ["US/Eastern", "America/New_York"],
  ["Europe/Kiev", "Europe/Kyiv"],
  ["Asia/Saigon", "Asia/Ho_Chi_Minh"],
];

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

  it("an old name this Postgres cannot read is the zone tzdata links it to, a zone it reads", async () => {
    const listed = async (tz: string) =>
      (
        (await iso.db.execute(sql`SELECT z.zone FROM pg_timezone_names AS z(zone) WHERE z.zone = ${tz}`)) as {
          zone: string;
        }[]
      ).length > 0;
    for (const [old, zone] of OLD_NAMES) {
      expect(await listed(zone)).toBe(true);
      // A Postgres with tzdata-legacy lists the old name itself, and it is kept as listed.
      const expected = (await listed(old)) ? old : zone;
      expect(await postgresZone(iso.db, old), old).toEqual({ zone: expected });
      expect(await postgresZone(iso.db, old.toLowerCase()), old).toEqual({ zone: expected });
    }
  });
});

describe("the link step, against a list without the old names", () => {
  // As Postgres lists names without tzdata-legacy, and with the names Debian keeps in tzdata itself.
  const names = new Map(
    ["Asia/Kolkata", "America/New_York", "Europe/Kyiv", "Asia/Ho_Chi_Minh", "Europe/Bratislava", "Europe/Prague"].map(
      (z) => [z.toLowerCase(), z],
    ),
  );

  it("each old name, in any case, is its zone", () => {
    for (const [old, zone] of OLD_NAMES) {
      expect(resolveZone(names, old)).toEqual({ zone });
      expect(resolveZone(names, old.toUpperCase())).toEqual({ zone });
    }
  });

  it("a name the list holds is kept, though tzdata links it elsewhere; a link to a zone the list lacks is a miss", () => {
    expect(TZ_LINKS["Europe/Bratislava"]).toBe("Europe/Prague");
    expect(resolveZone(names, "Europe/Bratislava")).toEqual({ zone: "Europe/Bratislava" });
    expect(resolveZone(names, "Asia/Rangoon")).toEqual({ zone: null, miss: "unknown_to_postgres" });
  });
});

describe("the link table", () => {
  it("is generated from tzdata.zi's links, a chain followed to its zone", () => {
    const zi = "# version 2099z\nZ Real/Zone 0 - X\nL Real/Zone Old/One\nL Old/One Old/Two\n";
    expect(linksOf(zi)).toEqual({
      version: "2099z",
      links: new Map([
        ["Old/One", "Real/Zone"],
        ["Old/Two", "Real/Zone"],
      ]),
    });
  });

  it("is this machine's tzdata, when it is the release the file names", () => {
    const zi = "/usr/share/zoneinfo/tzdata.zi";
    if (!existsSync(zi)) return;
    const { version, links } = linksOf(readFileSync(zi, "utf8"));
    if (version !== TZ_LINKS_TZDATA) return;
    expect(new Map(Object.entries(TZ_LINKS))).toEqual(links);
  });
});
