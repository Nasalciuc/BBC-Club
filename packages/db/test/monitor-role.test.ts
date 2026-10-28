/** 0053 (ADR-IMPL-077, ⚑A): Grafana's role reads, briefly, a few at a time — logged in as it, a statement stops at
 *  10 s and a write is refused whatever the table. Roles are the cluster's: the cluster's bbc_monitor is only read here;
 *  the login runs on a role of this test's own, given 0053's text as it is written, and dropped after. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

const LIMITS = readFileSync(join(import.meta.dir, "../migrations/0053_platform_monitor_role_limits.sql"), "utf8");

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-monitor-role", { max: 1 });
});
afterAll(() => iso.drop());

/** A role's connection limit and its own settings (every database), from the catalog. */
const settingsOf = async (role: string) => {
  const [row] = (await iso.db.execute(sql`
    SELECT r.rolconnlimit AS "limit", coalesce(s.setconfig, '{}') AS config
    FROM pg_roles r LEFT JOIN pg_db_role_setting s ON s.setrole = r.oid AND s.setdatabase = 0
    WHERE r.rolname = ${role}`)) as unknown as { limit: number; config: string[] }[];
  return row;
};

describe("bbc_monitor", () => {
  it("the migrated role: three connections at most, statements stopped at 10 s, transactions read-only", async () => {
    const role = await settingsOf("bbc_monitor");
    expect(role?.limit).toBe(3);
    expect([...role!.config].sort()).toEqual(["default_transaction_read_only=on", "statement_timeout=10s"]);
  });

  it("0053 on a role of its own: logged in, its statements stop at 10 s and it writes nothing; run twice, the same", async () => {
    const name = `monitor_probe_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const password = crypto.randomUUID();
    const limits = LIMITS.replaceAll("bbc_monitor", name);
    await iso.db.execute(sql.raw(`CREATE ROLE ${name} NOLOGIN`));
    try {
      // A table it may write to, so a refusal can only be the read-only transaction's.
      await iso.db.execute(sql`CREATE TABLE public.monitor_probe (x int)`);
      await iso.db.execute(sql.raw(limits));
      // A second database migrating finds nothing to change: the role's rows are not written again.
      const written = sql`
        SELECT (SELECT a.xmin::text FROM pg_authid a WHERE a.rolname = ${name}) AS role,
               (SELECT s.xmin::text FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
                WHERE r.rolname = ${name} AND s.setdatabase = 0) AS settings`;
      type Written = { role: string; settings: string }[];
      const first = (await iso.db.execute(written)) as unknown as Written;
      await iso.db.execute(sql.raw(limits));
      expect((await iso.db.execute(written)) as unknown as Written).toEqual(first);
      expect(first[0]?.role).toBeTruthy();
      const role = await settingsOf(name);
      expect(role?.limit).toBe(3);
      expect([...role!.config].sort()).toEqual(["default_transaction_read_only=on", "statement_timeout=10s"]);

      await iso.db.execute(sql.raw(`GRANT INSERT ON public.monitor_probe TO ${name}`));
      // A role's settings apply at login (not to SET ROLE). The login lapses in five minutes: a run stopped before its
      // cleanup leaves a role nobody can log in as.
      const until = new Date(Date.now() + 5 * 60_000).toISOString();
      await iso.db.execute(sql.raw(`ALTER ROLE ${name} LOGIN PASSWORD '${password}' VALID UNTIL '${until}'`));
      const url = new URL(iso.url);
      url.username = name;
      url.password = password;
      const monitor = postgres(url.toString(), { max: 1, onnotice: () => {} });
      const refusal = (q: Promise<unknown>) =>
        q.then(
          () => "written",
          (e: { code?: string }) => e.code,
        );
      try {
        const [shown] = await monitor`SHOW statement_timeout`;
        expect(shown?.statement_timeout).toBe("10s");
        expect(await refusal(monitor`INSERT INTO public.monitor_probe VALUES (1)`)).toBe("25006"); // read-only
        expect(await refusal(monitor`INSERT INTO platform.flags (key, value) VALUES ('monitor.probe', '{}')`)).not.toBe(
          "written",
        );
      } finally {
        await monitor.end();
      }
    } finally {
      await iso.db.execute(sql`DROP TABLE IF EXISTS public.monitor_probe`);
      await iso.db.execute(sql.raw(`DROP ROLE IF EXISTS ${name}`));
    }
  });
});
