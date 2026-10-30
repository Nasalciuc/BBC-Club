/** anyText (ADR-IMPL-077): a list of any length is one bound array — one statement text for 1, 7 or 100 values — and
 *  binds as Postgres reads it: straight or through PgBouncer, named statements or not, every value as sent. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { char, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createDb } from "../src/client";
import { anyOf, anyText } from "../src/helpers";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

const probe = pgTable("any_text_probe", { id: text("id").primaryKey() });
/** Values a list would break on if it were spliced: commas, quotes, braces, a backslash, spaces, the word NULL. */
const AWKWARD = ["a,b", 'q"uote', "back\\slash", "{brace}", " spaced ", "NULL", "ünï", "it's"];
const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-any-text", { max: 2 });
  await iso.db.execute(sql`CREATE TABLE public.any_text_probe (id text PRIMARY KEY)`);
  await iso.db.insert(probe).values([...AWKWARD, "other"].map((id) => ({ id })));
});
afterAll(() => iso.drop());

const typed = pgTable("any_of_probe", { code: char("code", { length: 3 }), ref: uuid("ref"), n: integer("n") });

describe("anyOf", () => {
  it("a char(3), uuid or int4 column: one statement text whatever the list's length, cast to the column's own type", () => {
    const codes = (n: number) => Array.from({ length: n }, (_, i) => `C${String(i).padStart(2, "0")}`);
    for (const [where, type] of [
      [(n: number) => anyOf(typed.code, codes(n), "bpchar"), "bpchar"],
      [
        (n: number) =>
          anyOf(
            typed.ref,
            Array.from({ length: n }, () => crypto.randomUUID()),
            "uuid",
          ),
        "uuid",
      ],
      [
        (n: number) =>
          anyOf(
            typed.n,
            Array.from({ length: n }, (_, i) => i),
            "int4",
          ),
        "int4",
      ],
    ] as const) {
      const queries = [1, 7, 100].map((n) => iso.db.select().from(typed).where(where(n)).toSQL());
      expect(new Set(queries.map((q) => q.sql)).size).toBe(1);
      expect(queries[0]!.sql).toContain(`= ANY($1::${type}[])`);
      expect(queries.map((q) => q.params.length)).toEqual([1, 1, 1]);
    }
  });

  it("finds the rows named, uses the column's index, and an empty list matches nothing", async () => {
    await iso.db.execute(
      sql`CREATE TABLE IF NOT EXISTS public.any_of_probe (code char(3) PRIMARY KEY, ref uuid, n int4)`,
    );
    await iso.db.execute(sql`INSERT INTO public.any_of_probe (code, ref, n) SELECT 'A' || lpad(g::text, 2, '0'),
      gen_random_uuid(), g FROM generate_series(0, 99) g ON CONFLICT DO NOTHING`);
    const rows = await iso.db
      .select()
      .from(typed)
      .where(anyOf(typed.code, ["A01", "A02", "ZZZ"], "bpchar"));
    expect(rows.map((r) => r.code).sort()).toEqual(["A01", "A02"]);
    expect(
      await iso.db
        .select()
        .from(typed)
        .where(anyOf(typed.n, [], "int4")),
    ).toEqual([]);
    // The column's own type keeps its index usable; text[] on a char(3) column casts the column and leaves it.
    const planOf = (pgType: "bpchar" | "text") =>
      iso.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL enable_seqscan = off`);
        const rows = (await tx.execute(
          sql`EXPLAIN (FORMAT JSON) SELECT * FROM public.any_of_probe WHERE ${anyOf(typed.code, ["A01", "A02"], pgType)}`,
        )) as unknown as { "QUERY PLAN": unknown }[];
        return JSON.stringify(rows[0]!["QUERY PLAN"]);
      });
    expect(await planOf("bpchar")).toContain("any_of_probe_pkey");
    expect(await planOf("text")).not.toContain("any_of_probe_pkey");
  });
});

describe("anyText", () => {
  it("1, 7 and 100 values: one statement text, one parameter", () => {
    const queries = [1, 7, 100].map((n) =>
      iso.db
        .select()
        .from(probe)
        .where(anyText(probe.id, ids(n)))
        .toSQL(),
    );
    expect(new Set(queries.map((q) => q.sql)).size).toBe(1);
    expect(queries[0]!.sql).toContain('"id" = ANY($1::text[])');
    expect(queries.map((q) => q.params.length)).toEqual([1, 1, 1]);
  });

  it("finds exactly the rows named, however their values are written", async () => {
    const unnamed = createDb(iso.url, { max: 1, prepare: false });
    try {
      for (const db of [iso.db, unnamed]) {
        const rows = await db.select().from(probe).where(anyText(probe.id, AWKWARD));
        expect(rows.map((r) => r.id).sort()).toEqual([...AWKWARD].sort());
        expect(
          await db
            .select()
            .from(probe)
            .where(anyText(probe.id, ["none"])),
        ).toEqual([]);
      }
    } finally {
      await unnamed.close();
    }
  });

  it("binds through PgBouncer in transaction mode, named statements or not", async () => {
    const url = process.env.PGBOUNCER_URL;
    const probeConn = url ? postgres(url, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {} }) : null;
    const up = probeConn
      ? await probeConn`SELECT 1`.then(
          () => true,
          () => false,
        )
      : false;
    await probeConn?.end({ timeout: 1 });
    if (!up) return;
    for (const prepare of [true, false]) {
      const db = createDb(url!, { pooler: "transaction", prepare, max: 2, applicationName: "any-text" });
      try {
        const rows = (await db.execute(
          sql`SELECT x FROM unnest(${sql.param(AWKWARD)}::text[]) AS u(x)`,
        )) as unknown as { x: string }[];
        expect(rows.map((r) => r.x)).toEqual(AWKWARD);
      } finally {
        await db.close();
      }
    }
  });
});
