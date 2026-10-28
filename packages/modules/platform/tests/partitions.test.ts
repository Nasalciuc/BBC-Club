/** The journal's partitions job (ADR-IMPL-077): it never holds the journal's writes behind a long read (it waits 3 s at
 *  most, then tomorrow), and it cuts months in UTC whatever the session's time zone (X7). */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform, registerPlatformJobs } from "../src/api";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("platform-partitions", { max: 3 });
});
afterAll(() => iso.drop());

type Db = IsolatedDb["db"];
const partitionsJob = (db: Db) => {
  const p = createPlatform(db, { level: "silent" });
  registerPlatformJobs(p.jobs, p.metrics);
  return () => p.jobs.run("partitions");
};

/** The journal's monthly partitions, oldest first, each with its bounds read in UTC. */
async function partitions(): Promise<{ name: string; from: string; to: string }[]> {
  return (await iso.db.execute(sql`
    SELECT c.relname AS name,
           to_char((b[1])::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS "from",
           to_char((b[2])::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS "to"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL regexp_match(pg_get_expr(c.relpartbound, c.oid), 'FROM \\(''([^'']+)''\\) TO \\(''([^'']+)''\\)') b
    WHERE n.nspname = 'platform' AND c.relname ~ '^domain_events_[0-9]{4}_[0-9]{2}$'
    ORDER BY c.relname`)) as unknown as { name: string; from: string; to: string }[];
}
/** The last month of the current horizon — this month and the next three, in UTC, as the job makes them — dropped, so
 *  the job has one to make again (CodeRabbit on #113: the template keeps the partitions of the day it was built). */
const dropLast = async () => {
  await iso.db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL TimeZone = 'UTC'`);
    await tx.execute(sql`SELECT platform.ensure_event_partitions(3)`);
  });
  const now = new Date();
  const horizon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));
  const name = `domain_events_${horizon.getUTCFullYear()}_${String(horizon.getUTCMonth() + 1).padStart(2, "0")}`;
  expect(await exists(name)).toBe(true);
  await iso.db.execute(sql.raw(`DROP TABLE platform.${name}`));
  return name;
};
const exists = async (name: string) => (await partitions()).some((p) => p.name === name);

describe("the partitions job", () => {
  it("a journal held past 3 s leaves the new partition for tomorrow; the next run makes it", async () => {
    const missing = await dropLast();
    const run = partitionsJob(iso.db);

    // Another connection reads the journal and keeps its transaction open, as a long report would.
    const reader = postgres(iso.url, { max: 1, onnotice: () => {} });
    const reading = Promise.withResolvers<void>();
    const done = Promise.withResolvers<void>();
    const held = reader.begin(async (tx) => {
      await tx`SELECT id FROM platform.domain_events LIMIT 1`;
      reading.resolve();
      await done.promise;
    });
    try {
      await reading.promise;
      const t = performance.now();
      const deferred = await run();
      expect(performance.now() - t).toBeLessThan(5_000);
      expect(deferred.error ?? deferred.status).toBe("succeeded");
      expect(deferred.metrics?.partitionsDeferred).toBe(1);
      expect(await exists(missing)).toBe(false);
    } finally {
      done.resolve();
      await held;
      await reader.end();
    }

    const next = await run();
    expect(next.metrics?.partitionsDeferred).toBe(0);
    expect(await exists(missing)).toBe(true);
  }, 20_000);

  it("X7: from a session in New York, a new month still starts at 00:00 UTC, where the one before ends", async () => {
    await iso.db.execute(sql.raw(`ALTER DATABASE "${iso.name}" SET TimeZone = 'America/New_York'`));
    const ny = createDb(iso.url, { max: 3 }); // new connections: the database's time zone
    try {
      const [{ TimeZone: tz }] = (await ny.execute(sql`SHOW TimeZone`)) as unknown as { TimeZone: string }[];
      expect(tz).toBe("America/New_York");
      const missing = await dropLast();

      const run = await partitionsJob(ny as Db)();
      expect(run.error ?? run.status).toBe("succeeded");

      const all = await partitions();
      const i = all.findIndex((p) => p.name === missing);
      expect(i).toBeGreaterThan(0);
      const [before, made] = [all[i - 1]!, all[i]!];
      expect(made.from.endsWith(" 00:00")).toBe(true);
      expect(made.from).toBe(before.to); // no gap between the two months
      expect(made.from.slice(0, 7).replace("-", "_")).toBe(missing.slice(-7));

      // An event at 02:00 UTC on the new month's first day has a partition to go to.
      const at = `${made.from.slice(0, 10)} 02:00:00+00`;
      await ny.execute(sql`
        INSERT INTO platform.domain_events (type, aggregate_type, aggregate_id, payload, published_by, occurred_at)
        VALUES ('x7.probe', 'probe', 'x7', '{}', 'test', ${at}::timestamptz)`);
      const [{ n }] = (await iso.db.execute(
        sql`SELECT count(*)::int AS n FROM platform.domain_events WHERE type = 'x7.probe'`,
      )) as unknown as { n: number }[];
      expect(n).toBe(1);
    } finally {
      await ny.close();
      await iso.db.execute(sql.raw(`ALTER DATABASE "${iso.name}" RESET TimeZone`));
    }
  }, 20_000);
});
