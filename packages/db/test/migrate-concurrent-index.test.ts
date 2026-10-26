/** The concurrent-index runner drops an INVALID index of the same name before building, checks indisvalid after,
 *  and records the file only when every index is valid. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyConcurrentIndexFile, isValid } from "../scripts/concurrent-indexes";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

async function setupDupTable(db: IsolatedDb["db"]) {
  await db.raw.unsafe("SET statement_timeout = 0");
  await db.raw.unsafe("SET lock_timeout = '5s'");
  await db.raw.unsafe("CREATE SCHEMA IF NOT EXISTS mig_ci");
  await db.raw.unsafe("DROP TABLE IF EXISTS mig_ci.t CASCADE");
  await db.raw.unsafe("CREATE TABLE mig_ci.t (v int)");
  await db.raw.unsafe("INSERT INTO mig_ci.t (v) VALUES (1), (1)");
}

describe("concurrent-index runner", () => {
  it("drops an INVALID index, rebuilds it, and records the file only when valid", async () => {
    // CONCURRENTLY needs more than one connection on the pool (a single slot can wait forever).
    const iso = await isolatedDb("db-conc-idx-ok", { max: 2 });
    const tmp = mkdtempSync(join(tmpdir(), "bbc-conc-idx-"));
    try {
      const db = iso.db;
      await setupDupTable(db);

      let uniqueFailed = false;
      try {
        await db.raw.unsafe("CREATE UNIQUE INDEX CONCURRENTLY t_idx ON mig_ci.t (v)");
      } catch {
        uniqueFailed = true;
      }
      expect(uniqueFailed).toBe(true);
      expect(await isValid(db, { schema: "mig_ci", name: "t_idx" })).toBe(false);

      const file = join(tmp, "test_rebuild_invalid.sql");
      writeFileSync(file, "CREATE INDEX CONCURRENTLY IF NOT EXISTS t_idx ON mig_ci.t (v);\n");
      const name = "test_rebuild_invalid.sql";

      await applyConcurrentIndexFile(db, name, file, "test rebuild invalid applied");

      expect(await isValid(db, { schema: "mig_ci", name: "t_idx" })).toBe(true);
      const ledger = (await db.execute(sql`SELECT 1 FROM platform.extras_applied WHERE name = ${name}`)) as unknown[];
      expect(ledger).toHaveLength(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      await iso.drop();
    }
  }, 60_000);

  it("a build that fails does not record the file", async () => {
    const iso = await isolatedDb("db-conc-idx-fail", { max: 2 });
    const tmp = mkdtempSync(join(tmpdir(), "bbc-conc-idx-"));
    try {
      const db = iso.db;
      await setupDupTable(db);

      const file = join(tmp, "test_unique_fail.sql");
      writeFileSync(file, "CREATE UNIQUE INDEX CONCURRENTLY t_fail ON mig_ci.t (v);\n");
      const name = "test_unique_fail.sql";

      await expect(applyConcurrentIndexFile(db, name, file, "should not log")).rejects.toThrow();

      const ledger = (await db.execute(sql`SELECT 1 FROM platform.extras_applied WHERE name = ${name}`)) as unknown[];
      expect(ledger).toHaveLength(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      await iso.drop();
    }
  }, 60_000);
});
