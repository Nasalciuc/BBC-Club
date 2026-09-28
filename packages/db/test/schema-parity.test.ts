import { test, expect, beforeAll, afterAll } from "bun:test";
import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig, isPgEnum } from "drizzle-orm/pg-core";
import * as schema from "../src/schema";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

/** Tables the code does not own: the migration runner's ledger and the journal's monthly partitions. */
const NOT_IN_CODE = new Set(["platform.extras_applied"]);
const PARTITION = /_\d{4}_\d{2}$|_default$/;
const OWNED = [
  "platform",
  "members",
  "notifications",
  "proposals",
  "engagement",
  "requests",
  "catalog",
  "crm",
  "personalization",
  "auth",
];

let iso: IsolatedDb;
let db: any;
beforeAll(async () => {
  iso = await isolatedDb("db-schema-parity");
  db = iso.db;
});
afterAll(() => iso?.drop());

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(\s*/g, "(")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\)/g, ")");
function dbType(r: any): string {
  if (r.data_type === "USER-DEFINED") return r.udt_name;
  if (r.data_type === "ARRAY") return `${r.udt_name.replace(/^_/, "")}[]`;
  if (r.data_type === "numeric" && r.numeric_precision) return `numeric(${r.numeric_precision},${r.numeric_scale})`;
  if (r.data_type === "character varying" && r.character_maximum_length)
    return `varchar(${r.character_maximum_length})`;
  if (r.data_type === "character" && r.character_maximum_length) return `char(${r.character_maximum_length})`;
  return r.data_type;
}
const idxCols = (def: string) =>
  (def.match(/\(([^)]*)\)(?:\s+WHERE.*)?$/)?.[1] ?? "")
    .split(",")
    .map((x) => x.trim().replace(/"/g, "").split(" ")[0])
    .join(",");

test("the Drizzle schema and the migrated database are the same", async () => {
  const drift: string[] = [];
  const codeTables = new Set<string>();
  for (const t of Object.values(schema).filter((v) => is(v as any, PgTable)) as PgTable[]) {
    const c = getTableConfig(t);
    const sch = c.schema ?? "public";
    const name = `${sch}.${c.name}`;
    codeTables.add(name);
    const cols: any[] =
      await db.execute(sql`SELECT column_name, is_nullable, data_type, udt_name, character_maximum_length,
      numeric_precision, numeric_scale, column_default FROM information_schema.columns WHERE table_schema = ${sch} AND table_name = ${c.name}`);
    if (cols.length === 0) {
      drift.push(`TABLE missing in DB: ${name}`);
      continue;
    }
    const byName = new Map(cols.map((r) => [r.column_name, r]));
    for (const col of c.columns) {
      const r = byName.get(col.name);
      if (!r) {
        drift.push(`COLUMN missing in DB: ${name}.${col.name}`);
        continue;
      }
      byName.delete(col.name);
      if ((r.is_nullable === "NO") !== col.notNull)
        drift.push(`NULLABILITY ${name}.${col.name}: code notNull=${col.notNull} · db nullable=${r.is_nullable}`);
      const ct = norm(col.getSQLType()).replace(/^"?[a-z_]+"?\."?([a-z_]+)"?$/, "$1");
      const dt = norm(dbType(r));
      if (dt !== ct && !(ct === "serial" && dt === "integer") && !(ct === "bigserial" && dt === "bigint"))
        drift.push(`TYPE ${name}.${col.name}: code ${ct} · db ${dt}`);
      if (col.hasDefault !== (r.column_default != null) && !["serial", "bigserial"].includes(ct))
        drift.push(`DEFAULT ${name}.${col.name}: code ${col.hasDefault} · db ${r.column_default ?? "none"}`);
    }
    for (const extra of byName.keys()) drift.push(`COLUMN only in DB: ${name}.${extra}`);
    const idx: any[] = await db.execute(
      sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = ${sch} AND tablename = ${c.name}`,
    );
    for (const i of c.indexes) {
      const cfg = (i as any).config;
      const cols2 = cfg.columns.map((x: any) => x.name ?? "?").join(",");
      if (idx.some((r) => r.indexname === cfg.name)) continue;
      const same = idx.find((r) => idxCols(r.indexdef) === cols2);
      drift.push(
        same
          ? `INDEX NAME ${name}: code "${cfg.name}" · db "${same.indexname}" (${cols2})`
          : `INDEX missing in DB: ${name} ${cfg.name} (${cols2})`,
      );
    }
  }
  const owned: any[] = await db.execute(sql`SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
    WHERE table_type = 'BASE TABLE' AND table_schema IN (${sql.join(
      OWNED.map((s) => sql`${s}`),
      sql`, `,
    )})`);
  for (const r of owned)
    if (!codeTables.has(r.t) && !NOT_IN_CODE.has(r.t) && !PARTITION.test(r.t)) drift.push(`TABLE only in DB: ${r.t}`);
  if (drift.length) console.log(drift.map((d) => "  " + d).join("\n"));
  expect(drift).toEqual([]);
});

// ── Extensions: each compares definitions both ways, never names alone. ─────────────────────────────────────────
const tables = () => Object.values(schema).filter((v) => is(v as any, PgTable)) as PgTable[];
const ownedIn = sql.join(
  OWNED.map((s) => sql`${s}`),
  sql`, `,
);

test("every enum has the database's labels, in the same order", async () => {
  const drift: string[] = [];
  const code = new Map<string, readonly string[]>();
  for (const e of Object.values(schema).filter((v) => isPgEnum(v)) as any[]) {
    const key = `${e.schema ?? "public"}.${e.enumName}`;
    code.set(key, e.enumValues);
  }
  const rows: any[] = await db.execute(sql`
    SELECT n.nspname || '.' || t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname IN (${ownedIn}) GROUP BY 1`);
  const inDb = new Map<string, string[]>(rows.map((r) => [r.name, r.labels]));
  for (const [name, labels] of code) {
    const dbLabels = inDb.get(name);
    if (!dbLabels) drift.push(`ENUM missing in DB: ${name}`);
    else if (dbLabels.join(",") !== labels.join(","))
      drift.push(`ENUM ${name}: code [${labels.join(",")}] · db [${dbLabels.join(",")}]`);
  }
  for (const name of inDb.keys()) if (!code.has(name)) drift.push(`ENUM only in DB: ${name}`);
  if (drift.length) console.log(drift.map((d) => "  " + d).join("\n"));
  expect(drift).toEqual([]);
});

test("primary keys and unique constraints are the same, by columns", async () => {
  const drift: string[] = [];
  for (const t of tables()) {
    const c = getTableConfig(t);
    const sch = c.schema ?? "public";
    const name = `${sch}.${c.name}`;
    const pkCols =
      c.primaryKeys[0]?.columns.map((x) => x.name) ?? c.columns.filter((x) => x.primary).map((x) => x.name);
    const code = new Set<string>([`PK ${pkCols.join(",")}`]);
    for (const u of c.uniqueConstraints) code.add(`UNIQUE ${u.columns.map((x) => x.name).join(",")}`);
    for (const col of c.columns) if (col.isUnique) code.add(`UNIQUE ${col.name}`);
    for (const i of c.indexes) {
      const cfg = (i as any).config;
      if (cfg.unique)
        code.add(`UNIQUE ${cfg.columns.map((x: any) => x.name ?? "?").join(",")}${cfg.where ? " (partial)" : ""}`);
    }
    const rows: any[] = await db.execute(sql`
      SELECT i.indisprimary AS pk, i.indpred IS NOT NULL AS partial,
             (SELECT string_agg(coalesce(a.attname, '?'), ',' ORDER BY k.ord)
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
              LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS cols
      FROM pg_index i
      WHERE i.indrelid = (quote_ident(${sch}) || '.' || quote_ident(${c.name}))::regclass AND i.indisunique`);
    const inDb = new Set<string>(
      rows.map((r) => (r.pk ? `PK ${r.cols}` : `UNIQUE ${r.cols}${r.partial ? " (partial)" : ""}`)),
    );
    for (const k of code) if (!inDb.has(k)) drift.push(`${k} missing in DB: ${name}`);
    for (const k of inDb) if (!code.has(k)) drift.push(`${k} only in DB: ${name}`);
  }
  if (drift.length) console.log(drift.map((d) => "  " + d).join("\n"));
  expect(drift).toEqual([]);
});

test("foreign keys are the same, ON DELETE included — and none crosses a schema", async () => {
  const drift: string[] = [];
  const action: Record<string, string> = {
    a: "no action",
    r: "restrict",
    c: "cascade",
    n: "set null",
    d: "set default",
  };
  for (const t of tables()) {
    const c = getTableConfig(t);
    const sch = c.schema ?? "public";
    const name = `${sch}.${c.name}`;
    const code = new Set<string>();
    for (const fk of c.foreignKeys) {
      const ref = fk.reference();
      const f = getTableConfig(ref.foreignTable);
      const fsch = f.schema ?? "public";
      if (fsch !== sch) drift.push(`CROSS-SCHEMA FK in code: ${name} → ${fsch}.${f.name}`);
      code.add(
        `(${ref.columns.map((x) => x.name).join(",")}) → ${fsch}.${f.name}(${ref.foreignColumns.map((x) => x.name).join(",")}) ON DELETE ${fk.onDelete ?? "no action"}`,
      );
    }
    const rows: any[] = await db.execute(sql`
      SELECT (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols,
             fn.nspname || '.' || fc.relname AS ftable,
             (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS fcols,
             con.confdeltype AS del
      FROM pg_constraint con
      JOIN pg_class fc ON fc.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
      WHERE con.contype = 'f' AND con.conrelid = (quote_ident(${sch}) || '.' || quote_ident(${c.name}))::regclass`);
    const inDb = new Set<string>(
      rows.map((r) => `(${r.cols}) → ${r.ftable}(${r.fcols}) ON DELETE ${action[r.del] ?? r.del}`),
    );
    for (const k of code) if (!inDb.has(k)) drift.push(`FK missing in DB: ${name} ${k}`);
    for (const k of inDb) if (!code.has(k)) drift.push(`FK only in DB: ${name} ${k}`);
  }
  if (drift.length) console.log(drift.map((d) => "  " + d).join("\n"));
  expect(drift).toEqual([]);
});
