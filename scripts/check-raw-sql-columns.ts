/** Ratchet: counts column names written as TEXT inside sql`…` templates (outside ${…}) in the modules' data code.
 *  A rename in the Drizzle schema cannot reach those. The count may only go down: it fails when it rises above the baseline. */
import { Glob } from "bun";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../packages/db/src/schema";

const BASELINE = "scripts/raw-sql-columns.baseline.json";
const ROOTS = ["packages/modules/**/src/**/*.ts"];
const columns = new Set<string>();
for (const t of Object.values(schema))
  if (is(t as any, PgTable)) for (const c of getTableConfig(t as PgTable).columns) columns.add(c.name);

function textColumns(src: string): number {
  let n = 0;
  for (const m of src.matchAll(/sql`((?:\\`|[^`])*)`/g)) {
    const body = m[1]!
      .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, " ") // interpolations: columns referenced through the schema are fine
      .replace(/'(?:''|[^'])*'/g, " ") // string literals: values, not columns
      .replace(/--[^\n]*/g, " "); // comments
    for (const w of body.match(/\b[a-z_][a-z0-9_]*\b/g) ?? []) if (columns.has(w)) n++;
  }
  return n;
}
const byFile: Record<string, number> = {};
for (const root of ROOTS)
  for await (const raw of new Glob(root).scan(".")) {
    const f = raw.replaceAll("\\", "/");
    if (/\.test\.ts$|\/tests?\//.test(f)) continue;
    const n = textColumns(await Bun.file(raw).text());
    if (n) byFile[f] = n;
  }
const total = Object.values(byFile).reduce((a, b) => a + b, 0);
if (process.argv.includes("--write")) {
  await Bun.write(BASELINE, JSON.stringify({ total, byFile }, null, 2) + "\n");
  console.log(`baseline written: ${total}`);
  process.exit(0);
}
const base = await Bun.file(BASELINE)
  .json()
  .catch(() => null);
if (!base) {
  console.error(`no ${BASELINE} — run with --write once`);
  process.exit(1);
}
const grew = Object.entries(byFile).filter(([f, n]) => n > (base.byFile[f] ?? 0));
if (total > base.total || grew.length) {
  console.error(`raw SQL column names grew (${base.total} → ${total}):`, grew);
  process.exit(1);
}
console.log(`raw SQL column names: ${total} (baseline ${base.total})`);
