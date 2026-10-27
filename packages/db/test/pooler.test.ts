/** PgBouncer transaction pooling vs the repo's postgres.js client. Needs infra/compose.test.yml pgbouncer-test. */
import { describe, test, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { statement } from "../src/statements";
import postgres from "postgres";
import { createDb } from "../src/client";

const url = process.env.PGBOUNCER_URL;

async function poolerUp(): Promise<boolean> {
  if (!url) return false;
  const c = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 3,
    connection: { application_name: "pooler-probe" },
    onnotice: () => {},
  });
  try {
    await c`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await c.end({ timeout: 1 });
  }
}

describe("PgBouncer transaction pooling", () => {
  test("statement_timeout as a startup parameter is rejected", async () => {
    if (!(await poolerUp())) return;
    const c = postgres(url!, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
      connection: { application_name: "pooler-probe", statement_timeout: 15_000 },
      onnotice: () => {},
    });
    let code = "";
    try {
      await c`SELECT 1`;
    } catch (e: any) {
      code = String(e?.code ?? e?.cause?.code ?? e?.message ?? e);
    } finally {
      await c.end({ timeout: 1 }).catch(() => {});
    }
    expect(code).toMatch(/08P01|statement_timeout|unsupported startup/i);
  });

  test("prepare: false runs a parameterised query", async () => {
    if (!(await poolerUp())) return;
    const db = createDb(url!, { pooler: "transaction", prepare: false, max: 2, applicationName: "pooler-ok" });
    const rows = (await db.execute(sql`SELECT ${1}::int AS n`)) as unknown as { n: number }[];
    expect(Number(rows[0]?.n ?? (rows as any)[0]?.n)).toBe(1);
    await db.close();
  });

  // ADR-IMPL-074: named statements through PgBouncer 1.24 in transaction mode, as the API runs them.
  test("named statements: 1 000 executions on two clients, in and out of transactions, all answer", async () => {
    if (!(await poolerUp())) return;
    const db = createDb(url!, { pooler: "transaction", max: 4, applicationName: "pooler-named" });
    const plusOne = statement("pooler_named_probe", (exec) =>
      exec
        .select({ m: sql<number>`${sql.placeholder("n")}::int + 1`.mapWith(Number) })
        .from(sql`generate_series(1, 1) AS pooler_named_probe`),
    );
    try {
      const runs = Array.from({ length: 1_000 }, (_, i) => i);
      const answers = await Promise.all(
        runs.map(async (i) => {
          if (i % 10 === 0)
            return db.transaction(async (tx) => {
              const r = (await tx.execute(sql`SELECT ${i}::int + 1 AS m /* pooler_named_tx */`)) as unknown as {
                m: number;
              }[];
              return Number(r[0]!.m);
            });
          if (i % 3 === 0) return (await plusOne(db, { n: i }))[0]!.m;
          const r = (await db.execute(sql`SELECT ${i}::int + 1 AS m /* pooler_named_db */`)) as unknown as {
            m: number;
          }[];
          return Number(r[0]!.m);
        }),
      );
      expect(answers).toEqual(runs.map((i) => i + 1));
    } finally {
      await db.close();
    }
  }, 30_000);

  // Drizzle names every column it selects or returns, so an expand-only migration (a new column, a new table) leaves the
  // result type of every statement as it was. A `SELECT *` would not survive it through PgBouncer: the pooler hands the
  // retry the same server statement, and the error stays until DB_PREPARE=off or the pool reconnects (ADR-IMPL-074).
  test("named statements survive an ALTER TABLE ADD COLUMN between two executions", async () => {
    if (!(await poolerUp())) return;
    const admin = postgres(process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const table = `pooler_alter_${Date.now().toString(36)}`;
    await admin.unsafe(`CREATE TABLE ${table} (id int PRIMARY KEY, a text)`);
    await admin.unsafe(`INSERT INTO ${table} VALUES (1, 'x')`);
    const db = createDb(url!, { pooler: "transaction", max: 1, applicationName: "pooler-alter" });
    try {
      const read = () => db.execute(sql`SELECT id, a FROM ${sql.identifier(table)} WHERE id = ${1}`);
      expect(((await read()) as unknown as unknown[]).length).toBe(1);
      await admin.unsafe(`ALTER TABLE ${table} ADD COLUMN b text`);
      const after = (await read()) as unknown as Record<string, unknown>[];
      expect(after[0]).toEqual({ id: 1, a: "x" });
    } finally {
      await db.close();
      await admin.unsafe(`DROP TABLE ${table}`);
      await admin.end();
    }
  });

  test("named statements are planned once per server connection, not at every execution", async () => {
    if (!(await poolerUp())) return;
    const admin = postgres(process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    const marker = `pooler_plans_${Date.now().toString(36)}`;
    const db = createDb(url!, { pooler: "transaction", max: 2, applicationName: "pooler-plans" });
    try {
      for (let i = 0; i < 200; i++) await db.execute(sql`SELECT ${i}::int AS n, ${marker}::text AS marker`);
      const [row] = await admin<{ calls: string; plans: string }[]>`
        SELECT sum(calls)::text AS calls, sum(plans)::text AS plans FROM pg_stat_statements
        WHERE query LIKE ${"%AS n, $2::text AS marker%"}`;
      expect(Number(row?.calls)).toBeGreaterThanOrEqual(200);
      // A generic plan kept per server connection: a handful of custom plans first, never one per call.
      expect(Number(row?.plans)).toBeLessThan(50);
    } finally {
      await db.close();
      await admin.end();
    }
  });

  test("ALTER ROLE statement_timeout cancels a 16 s sleep", async () => {
    if (!(await poolerUp())) return;
    const db = createDb(url!, { pooler: "transaction", max: 1, applicationName: "pooler-timeout" });
    const t = performance.now();
    let code = "";
    try {
      await db.execute(sql`SELECT pg_sleep(20)`);
    } catch (e: any) {
      code = String(e?.cause?.code ?? e?.code ?? "");
    }
    await db.close();
    expect(code).toBe("57014");
    expect((performance.now() - t) / 1000).toBeLessThan(18);
  }, 25_000);
});
