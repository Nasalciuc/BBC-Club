/** 0053 (ADR-IMPL-077, ⚑A): Grafana's role reads, briefly, a few at a time — logged in as bbc_monitor, a statement
 *  stops at 10 s and a write is refused whatever the table. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-monitor-role", { max: 1 });
});
afterAll(() => iso.drop());

describe("bbc_monitor", () => {
  it("has three connections at most; logged in, its statements stop at 10 s and it writes nothing", async () => {
    const [role] = (await iso.db.execute(
      sql`SELECT rolconnlimit AS "limit" FROM pg_roles WHERE rolname = 'bbc_monitor'`,
    )) as unknown as { limit: number }[];
    expect(role?.limit).toBe(3);

    // A table it may write to, so a refusal can only be the read-only transaction's.
    await iso.db.execute(sql`CREATE TABLE public.monitor_probe (x int)`);
    await iso.db.execute(sql`GRANT INSERT ON public.monitor_probe TO bbc_monitor`);
    // The role's settings apply at login (not to SET ROLE): a login for this test only, taken back after.
    const password = crypto.randomUUID();
    await iso.db.execute(sql.raw(`ALTER ROLE bbc_monitor LOGIN PASSWORD '${password}'`));
    const url = new URL(iso.url);
    url.username = "bbc_monitor";
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
      await iso.db.execute(sql`ALTER ROLE bbc_monitor NOLOGIN PASSWORD NULL`);
    }
  });
});
