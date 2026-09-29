/** A non-unique, non-partial, non-expression index whose columns are a prefix of another index on the same table. */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-index-redundancy", { max: 1 });
});
afterAll(() => iso.drop());

/** Same shape as the 28 Sep audit (0 redundant among 100). Partitions skipped. */
const REDUNDANT = sql`
  SELECT n.nspname || '.' || c1.relname AS extra,
         n.nspname || '.' || c2.relname AS covering
  FROM pg_index i1
  JOIN pg_index i2 ON i1.indrelid = i2.indrelid AND i1.indexrelid <> i2.indexrelid
  JOIN pg_class c1 ON c1.oid = i1.indexrelid
  JOIN pg_class c2 ON c2.oid = i2.indexrelid
  JOIN pg_class tbl ON tbl.oid = i1.indrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE NOT tbl.relispartition
    AND NOT i1.indisunique
    AND NOT i1.indisprimary
    AND i1.indpred IS NULL
    AND i1.indexprs IS NULL
    AND i1.indnkeyatts > 0
    AND i1.indnkeyatts <= i2.indnkeyatts
    AND (string_to_array(i1.indkey::text, ' '))[1:i1.indnkeyatts]
      = (string_to_array(i2.indkey::text, ' '))[1:i1.indnkeyatts]
`;

describe("no redundant prefix indexes", () => {
  test("no non-unique index is a column-prefix of another index on the same table", async () => {
    const rows = (await iso.db.execute(REDUNDANT)) as { extra: string; covering: string }[];
    expect(rows).toEqual([]);
  });

  test("a scratch prefix duplicate fails naming both indexes", async () => {
    await iso.db.execute(sql`CREATE TABLE platform.scratch_idx (a int, b int)`);
    await iso.db.execute(sql`CREATE INDEX scratch_idx_ab ON platform.scratch_idx (a, b)`);
    await iso.db.execute(sql`CREATE INDEX scratch_idx_a ON platform.scratch_idx (a)`);
    const rows = (await iso.db.execute(REDUNDANT)) as { extra: string; covering: string }[];
    expect(rows.some((r) => r.extra.endsWith("scratch_idx_a") && r.covering.endsWith("scratch_idx_ab"))).toBe(true);
    await iso.db.execute(sql`DROP TABLE platform.scratch_idx`);
    const after = (await iso.db.execute(REDUNDANT)) as unknown[];
    expect(after).toEqual([]);
  });
});
