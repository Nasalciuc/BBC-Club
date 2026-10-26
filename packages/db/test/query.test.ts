/** query(): hand-written SQL returns rows TypeScript can trust, because Zod checked what Postgres sent. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";
import { query, RowShapeError } from "../src/client";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-query", { max: 2 });
  await iso.db.execute(sql`CREATE TABLE public.query_probe (id int PRIMARY KEY, label text NOT NULL)`);
  await iso.db.execute(sql`INSERT INTO public.query_probe VALUES (1, 'one'), (2, 'two')`);
});
afterAll(() => iso.drop());

const Probe = z.object({ id: z.number().int(), label: z.string() });

describe("query()", () => {
  it("returns typed rows", async () => {
    const rows = await query(iso.db, sql`SELECT id, label FROM public.query_probe ORDER BY id`, Probe);
    expect(rows).toEqual([
      { id: 1, label: "one" },
      { id: 2, label: "two" },
    ]);
    const first: { id: number; label: string } | undefined = rows[0]; // compile-time: the inferred type
    expect(first?.label).toBe("one");
  });

  it("a renamed column is a RowShapeError naming the field, not an undefined further down", async () => {
    const err = await query(
      iso.db,
      sql`SELECT id, label AS title FROM public.query_probe ORDER BY id`, // the column the code expects is gone
      Probe,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RowShapeError);
    expect((err as RowShapeError).message).toContain("label");
    expect((err as RowShapeError).sample).toEqual({ id: 1, title: "one" });
  });

  it("runs inside a transaction and sees its uncommitted writes", async () => {
    let seen: z.infer<typeof Probe>[] = [];
    const rollback = new Error("roll back");
    await iso.db
      .transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO public.query_probe VALUES (3, 'three')`);
        seen = await query(tx, sql`SELECT id, label FROM public.query_probe WHERE id = 3`, Probe);
        throw rollback;
      })
      .catch((e: unknown) => {
        if (e !== rollback) throw e;
      });
    expect(seen).toEqual([{ id: 3, label: "three" }]);
    expect(await query(iso.db, sql`SELECT id, label FROM public.query_probe WHERE id = 3`, Probe)).toEqual([]);
  });
});
