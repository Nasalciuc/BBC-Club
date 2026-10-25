/** The fares key (0034) on a database that has not run it yet, and on one that has: the copy that stays is the one on
 *  sale (0037, which runs first), a blank carrier is no carrier, and a step that would stop half-way is refused before
 *  anything runs. Each case rewinds a clone of the migrated template to the state it describes, then runs the real
 *  migration script. */
import { afterEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let iso: IsolatedDb | undefined;
afterEach(async () => {
  await iso?.drop();
  iso = undefined;
});

function runMigrate(url: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", "scripts/migrate.ts"], {
      cwd: pkgRoot,
      env: { ...process.env, DATABASE_URL: url },
      shell: true,
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (out += String(d)));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

/** The database as it stood after 0033: the fares key is 0006's index (no trip, every NULL carrier distinct), and
 *  0034, 0035 and 0037 have not run. */
async function rewindToBefore0034(db: IsolatedDb["db"]) {
  await db.execute(sql`DELETE FROM platform.extras_applied
    WHERE name IN ('0034_catalog_fares_key.sql', '0035_catalog_checks.sql', '0037_catalog_fares_keep_live_copy.sql')`);
  await db.execute(sql`ALTER TABLE catalog.fares DROP CONSTRAINT IF EXISTS fares_route_cabin_carrier`);
  await db.execute(
    sql`CREATE UNIQUE INDEX fares_route_cabin_carrier ON catalog.fares (route_from, route_to, cabin, carrier, valid_from)`,
  );
  await db.execute(sql`ALTER TABLE catalog.fares DROP CONSTRAINT IF EXISTS fares_duration_pos`);
  await db.execute(sql`ALTER TABLE catalog.airports DROP CONSTRAINT IF EXISTS airports_coordinates`);
}

/** One fare row; ages in days before now (negative: ahead). */
async function fare(
  db: IsolatedDb["db"],
  f: {
    from: string;
    to: string;
    carrier: string | null;
    price: number;
    published: boolean;
    endsIn: number;
    created: number;
    updated: number;
    trip?: string;
  },
) {
  await db.execute(sql`
    INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, price, trip, valid_from, valid_until, published, created_at, updated_at)
    VALUES (${f.from}, ${f.to}, 'business', ${f.carrier}, ${f.price}, ${f.trip ?? "one_way"}::catalog.fare_trip,
            '2026-01-01T00:00:00Z', now() + make_interval(days => ${f.endsIn}), ${f.published},
            now() - make_interval(days => ${f.created}), now() - make_interval(days => ${f.updated}))`);
}

const rowsOf = async (db: IsolatedDb["db"], from: string) =>
  (await db.execute(sql`SELECT price::int AS price, published, carrier FROM catalog.fares WHERE route_from = ${from}
    ORDER BY price`)) as unknown as { price: number; published: boolean; carrier: string | null }[];

const ledger = async (db: IsolatedDb["db"]) =>
  ((await db.execute(sql`SELECT name FROM platform.extras_applied`)) as unknown as { name: string }[]).map(
    (r) => r.name,
  );

describe("the fares key on a database that has not run 0034", () => {
  it("keeps the fare on sale, not the copy expire-fares touched last; a blank carrier is no carrier", async () => {
    iso = await isolatedDb("db-fares-key-before", { max: 2 });
    const db = iso.db;
    await rewindToBefore0034(db);
    // The live copy, imported first; the older copy expired and was unpublished today, so its updated_at is newest.
    await fare(db, {
      from: "ZZA",
      to: "ZZB",
      carrier: null,
      price: 1000,
      published: true,
      endsIn: 30,
      created: 2,
      updated: 2,
    });
    await fare(db, {
      from: "ZZA",
      to: "ZZB",
      carrier: null,
      price: 900,
      published: false,
      endsIn: -1,
      created: 10,
      updated: 0,
    });
    // A blank carrier beside none, both on sale: one fare; the last imported (newest) stays, its carrier none.
    await fare(db, {
      from: "ZZC",
      to: "ZZD",
      carrier: null,
      price: 1100,
      published: true,
      endsIn: 30,
      created: 5,
      updated: 5,
    });
    await fare(db, {
      from: "ZZC",
      to: "ZZD",
      carrier: "",
      price: 1200,
      published: true,
      endsIn: 30,
      created: 1,
      updated: 1,
    });

    const run = await runMigrate(iso.url);
    expect(run.code).toBe(0);

    expect(await rowsOf(db, "ZZA")).toEqual([{ price: 1000, published: true, carrier: null }]);
    expect(await rowsOf(db, "ZZC")).toEqual([{ price: 1200, published: true, carrier: null }]);
    const [key] = (await db.execute(
      sql`SELECT contype FROM pg_constraint WHERE conname = 'fares_route_cabin_carrier'`,
    )) as unknown as {
      contype: string;
    }[];
    expect(key?.contype).toBe("u");
    expect(await ledger(db)).toEqual(
      expect.arrayContaining(["0034_catalog_fares_key.sql", "0037_catalog_fares_keep_live_copy.sql"]),
    );
  });
});

describe("the fares key on a database that already ran 0034", () => {
  it("0037 changes nothing and is recorded", async () => {
    iso = await isolatedDb("db-fares-key-after", { max: 2 });
    const db = iso.db;
    await db.execute(sql`DELETE FROM platform.extras_applied WHERE name = '0037_catalog_fares_keep_live_copy.sql'`);
    await fare(db, {
      from: "ZZE",
      to: "ZZF",
      carrier: null,
      price: 1000,
      published: true,
      endsIn: 30,
      created: 2,
      updated: 2,
    });
    await fare(db, {
      from: "ZZE",
      to: "ZZF",
      carrier: null,
      price: 1300,
      published: false,
      endsIn: -1,
      created: 9,
      updated: 0,
      trip: "round_trip",
    });

    const run = await runMigrate(iso.url);
    expect(run.code).toBe(0);
    expect((await rowsOf(db, "ZZE")).length).toBe(2);
    expect(await ledger(db)).toContain("0037_catalog_fares_keep_live_copy.sql");
  });
});

describe("a step that would stop half-way", () => {
  it("an airport off the globe refuses the run before any step: 0034 is not applied alone", async () => {
    iso = await isolatedDb("db-fares-key-preflight", { max: 2 });
    const db = iso.db;
    await rewindToBefore0034(db);
    await db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng)
      VALUES ('ZZX', 'Nowhere Field', 'Nowhere', 'Nowhere', 'ZZ', 'Europe', 999, 500)`);
    await fare(db, {
      from: "ZZG",
      to: "ZZH",
      carrier: null,
      price: 1000,
      published: true,
      endsIn: 30,
      created: 2,
      updated: 2,
    });
    await fare(db, {
      from: "ZZG",
      to: "ZZH",
      carrier: null,
      price: 900,
      published: false,
      endsIn: -1,
      created: 10,
      updated: 0,
    });

    const run = await runMigrate(iso.url);
    expect(run.code).toBe(1);
    expect(run.out).toContain("ZZX");
    expect(run.out).toContain("off the globe");
    // Nothing ran: the old key, both copies, and no ledger row for 0034.
    expect((await rowsOf(db, "ZZG")).length).toBe(2);
    expect(await ledger(db)).not.toContain("0034_catalog_fares_key.sql");
  });
});
