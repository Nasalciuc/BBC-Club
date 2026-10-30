/** ADR-IMPL-074 (P1): a statement with up to MAX_NAMED_PARAMS parameters is named and stays prepared on its server
 *  connection; one with more is sent unnamed, so a statement whose text grows with its input (a list, a multi-row
 *  insert) leaves nothing prepared behind it. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";
import { MAX_NAMED_PARAMS } from "../src/named-statements";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-named-statements", { max: 1 });
});
afterAll(() => iso.drop());

const sumOf = (n: number) =>
  sql`SELECT ${sql.join(
    Array.from({ length: n }, (_, i) => sql`${i}::int`),
    sql` + `,
  )} AS s`;

describe("named statements and their parameters", () => {
  it(`up to ${MAX_NAMED_PARAMS} parameters: named and kept; past it: unnamed, nothing kept`, async () => {
    const db = createDb(iso.url, { max: 1, prepare: true });
    // Without parameters: postgres.js's simple protocol, so this count is never one of the statements it counts.
    const prepared = async () =>
      ((await db.execute(sql`SELECT count(*)::int AS n FROM pg_prepared_statements`)) as unknown as { n: number }[])[0]!
        .n;
    try {
      const base = await prepared();
      await db.execute(sumOf(3));
      expect(await prepared()).toBe(base + 1);
      await db.execute(sumOf(MAX_NAMED_PARAMS));
      expect(await prepared()).toBe(base + 2);
      await db.execute(sumOf(MAX_NAMED_PARAMS + 1));
      await db.execute(sumOf(500));
      expect(await prepared()).toBe(base + 2);
      // Unnamed, they still answer.
      expect(((await db.execute(sumOf(500))) as unknown as { s: number }[])[0]!.s).toBe((499 * 500) / 2);
    } finally {
      await db.close();
    }
  });
});
