/** CREATE INDEX CONCURRENTLY cannot run inside a transaction or as a multi-statement string.
 *  A build that failed half-way leaves an INVALID index that IF NOT EXISTS would skip: drop it and build again. */
import { existsSync, readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Db } from "../src/client";

/** `CREATE [UNIQUE] INDEX CONCURRENTLY [IF NOT EXISTS] name ON schema.table` → its schema and name. */
export function indexOf(stmt: string): { schema: string; name: string } | null {
  const m =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(?:ONLY\s+)?(\w+)\./i.exec(
      stmt,
    );
  return m ? { name: m[1]!, schema: m[2]! } : null;
}

/** true / false for an index that exists, null when there is none. */
export async function isValid(db: Db, i: { schema: string; name: string }): Promise<boolean | null> {
  const rows = (await db.execute(sql`
    SELECT x.indisvalid AS valid FROM pg_index x
    JOIN pg_class c ON c.oid = x.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${i.schema} AND c.relname = ${i.name}`)) as { valid: boolean }[];
  return rows.length ? rows[0]!.valid : null;
}

/**
 * Apply one CONCURRENTLY migration file outside a transaction. Records `name` in `platform.extras_applied`
 * only when every index in the file is valid after its build.
 */
export async function applyConcurrentIndexFile(db: Db, name: string, file: string, label: string): Promise<void> {
  if (!existsSync(file)) return;
  const done = (await db.execute(sql`SELECT 1 FROM platform.extras_applied WHERE name = ${name}`)) as unknown[];
  if (done.length) return;
  const statements = readFileSync(file, "utf8")
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((stmt) => stmt.length > 0);
  const raw = db.raw;
  // Outside a transaction: a long build is fine (no statement timeout), waiting on a lock is not.
  await raw.unsafe("SET statement_timeout = 0");
  await raw.unsafe("SET lock_timeout = '5s'");
  try {
    for (const stmt of statements) {
      const index = indexOf(stmt);
      // A build that failed half-way leaves an INVALID index that IF NOT EXISTS would skip: drop it and build again.
      if (index && (await isValid(db, index)) === false) {
        await raw.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS ${index.schema}.${index.name}`);
      }
      await raw.unsafe(stmt);
      if (index && (await isValid(db, index)) !== true) {
        throw new Error(`${name}: index ${index.schema}.${index.name} is not valid after its build`);
      }
    }
    // only after every index is valid:
    await db.execute(sql`INSERT INTO platform.extras_applied (name) VALUES (${name})`);
    console.log(label);
  } finally {
    await raw.unsafe("SET statement_timeout = '15s'");
  }
}
