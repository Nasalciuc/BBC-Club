/** A migration cannot block traffic: a block that cannot get its lock fails in ~5 s instead of queueing every
 *  query behind it (scripts/migrate.ts sets lock_timeout). */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-migrate-lock", { max: 2 });
  await iso.db.execute(sql`CREATE TABLE public.locked (id int PRIMARY KEY)`);
});
afterAll(() => iso.drop());

describe("lock_timeout in the migration runner", () => {
  test("a migration block that cannot get its lock fails in ~5 s with 55P03", async () => {
    const holder = postgres(iso.url, { max: 1, onnotice: () => {} });
    const locked = Promise.withResolvers<void>();
    const held = holder.begin(async (tx) => {
      await tx`LOCK TABLE public.locked IN ACCESS EXCLUSIVE MODE`;
      locked.resolve(); // the lock is held from here on — the test waits for this, not for a guessed delay
      await Bun.sleep(8_000);
    });
    await locked.promise;
    const t = performance.now();
    const err = await iso.db
      .transaction(async (tx: any) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE public.locked ADD COLUMN x int`);
      })
      .then(
        () => null,
        (e: any) => e,
      );
    expect(err?.cause?.code ?? err?.code).toBe("55P03");
    expect((performance.now() - t) / 1000).toBeLessThan(10);
    await held;
    await holder.end();
  }, 20_000);

  test("the runner itself exits 1 and says why when a table stays locked", async () => {
    // A fresh database, fully migrated; then 0018 is made pending again and the ledger table its block writes is
    // held by another session. The runner must stop within the lock timeout, exit 1, and say why.
    const fresh = await isolatedDb("db-migrate-lock-runner", { fromTemplate: false, max: 1 });
    try {
      const run = () =>
        Bun.spawn(["bun", "run", "scripts/migrate.ts"], {
          cwd: `${import.meta.dir}/..`,
          env: { ...process.env, DATABASE_URL: fresh.url },
          stdout: "pipe",
          stderr: "pipe",
        });
      const first = run();
      expect(await first.exited).toBe(0);
      // Pretend 0018 never ran, then hold the table its block locks: the re-run must stop, not wait.
      await fresh.db.execute(sql`DELETE FROM platform.extras_applied WHERE name = '0018_notifications_campaigns.sql'`);
      await fresh.db.execute(sql`DROP TABLE notifications.campaigns`);
      await fresh.db.execute(sql`DROP TYPE notifications.campaign_status`);
      const holder = postgres(fresh.url, { max: 1, onnotice: () => {} });
      const locked = Promise.withResolvers<void>();
      const held = holder.begin(async (tx) => {
        await tx`LOCK TABLE platform.extras_applied IN ACCESS EXCLUSIVE MODE`;
        locked.resolve();
        await Bun.sleep(9_000);
      });
      await locked.promise;
      const t = performance.now();
      const second = run();
      const code = await second.exited;
      const stderr = await new Response(second.stderr).text();
      expect(code).toBe(1);
      expect(stderr).toContain("lock_timeout");
      expect((performance.now() - t) / 1000).toBeLessThan(10);
      await held;
      await holder.end();
    } finally {
      await fresh.drop();
    }
  }, 60_000);
});
