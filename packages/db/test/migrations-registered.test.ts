/** Every numbered migration file is applied by scripts/migrate.ts. A new SQL file without its block fails here,
 *  in CI — not at deploy time, where it would silently never run. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

const MIGRATIONS = join(import.meta.dir, "../migrations");
const RUNNER = readFileSync(join(import.meta.dir, "../scripts/migrate.ts"), "utf8");
const FILES = readdirSync(MIGRATIONS)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();
const num = (f: string) => f.slice(0, 4);

/** The one historical duplicate number: three parallel branches each wrote a 0007; only 0007_db_verify_fitness is
 *  applied, and it contains the other two verbatim (they were deleted). Every number from 0008 on is unique. */
const GRANDFATHERED = new Set(["0007"]);
/** Re-applied on every run by design (idempotent repairs), so they leave no ledger row. */
const NO_LEDGER = new Set(["0003_platform_repair_journal_sequence.sql", "0004_auth_rate_limit_bigint.sql"]);
/** Matched by the runner's extras loop (/^\d{4}_.*extras\.sql$/) rather than by name. */
const byExtrasLoop = (f: string) => /^\d{4}_.*extras\.sql$/.test(f);

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-migrations-registered", { max: 1 });
});
afterAll(() => iso.drop());

describe("migrations are registered", () => {
  it("every 00NN_*.sql file has a block in migrate.ts", () => {
    const orphans = FILES.filter((f) => !byExtrasLoop(f) && !RUNNER.includes(`"${f}"`) && !RUNNER.includes(`'${f}'`));
    expect(orphans).toEqual([]);
  });

  it("numbers are unique and increasing; only 0007 is grandfathered", () => {
    const seen = new Map<string, string[]>();
    for (const f of FILES) seen.set(num(f), [...(seen.get(num(f)) ?? []), f]);
    const duplicates = [...seen.entries()].filter(([n, fs]) => fs.length > 1 && !GRANDFATHERED.has(n));
    expect(duplicates).toEqual([]);
    const numbers = [...seen.keys()].map(Number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("after migrate, the ledger holds a row for every file", async () => {
    const rows = (await iso.db.execute(sql`SELECT name FROM platform.extras_applied`)) as unknown as { name: string }[];
    const applied = new Set(rows.map((r) => r.name));
    const missing = FILES.filter((f) => !NO_LEDGER.has(f) && !applied.has(f));
    expect(missing).toEqual([]);
  });
});
