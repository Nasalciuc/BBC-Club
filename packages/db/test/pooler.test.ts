/** PgBouncer transaction pooling vs the repo's postgres.js client. Needs infra/compose.test.yml pgbouncer-test. */
import { describe, test, expect } from "bun:test";
import { sql } from "drizzle-orm";
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
    const db = createDb(url!, { pooler: "transaction", max: 2, applicationName: "pooler-ok" });
    const rows = (await db.execute(sql`SELECT 1 AS n`)) as unknown as { n: number }[];
    expect(Number(rows[0]?.n ?? (rows as any)[0]?.n)).toBe(1);
    await db.close();
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
