import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("db-migrate", { fromTemplate: false, max: 1 });
  db = iso.db;
});
afterAll(() => iso.drop());

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function runMigrate(): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", "scripts/migrate.ts"], {
      cwd: pkgRoot,
      env: { ...process.env, DATABASE_URL: iso.url },
      shell: true,
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (out += String(d)));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

describe("extras ledger", () => {
  it("second migrate applies nothing; ensure_event_partitions exists; ledger has 0001, 0005, 0006 and 0007", async () => {
    const first = await runMigrate();
    expect(first.code).toBe(0);

    const second = await runMigrate();
    expect(second.code).toBe(0);
    expect(second.out).not.toMatch(/extras applied: 0001/);
    expect(second.out).not.toMatch(/requests schema applied/);
    expect(second.out).not.toMatch(/catalog schema applied/);
    expect(second.out).not.toMatch(/db:verify fitness fixes applied/);

    await db.execute(sql`SELECT platform.ensure_event_partitions(1)`);

    const names: any[] = await db.execute(sql`SELECT name FROM platform.extras_applied ORDER BY name`);
    expect(names.map((r) => r.name)).toEqual([
      "0001_extras.sql",
      "0005_requests.sql",
      "0006_catalog.sql",
      "0007_db_verify_fitness.sql",
    ]);
  });
});
