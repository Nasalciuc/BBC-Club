/** Applies pending migrations. Exit codes: 0 applied/nothing, 1 failure (never 0 on error).
 *  Runs as a separate job BEFORE the API restarts (expand/contract). Serialized by an advisory lock so two
 *  deploys cannot race. `0001_extras.sql` (trigger, partitions, fitness view) is applied after drizzle's DDL. */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { readFileSync, existsSync } from "node:fs";
import { createDb } from "../src/client";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }

const db = createDb(url, { max: 1, applicationName: "bbc-migrate" });
try {
  const [{ ok }] = await db.execute(sql`SELECT pg_try_advisory_lock(hashtext('bbc.migrate')) AS ok`) as any;
  if (!ok) { console.error("another migration is running"); process.exit(1); }

  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });

  const extras = new URL("../migrations/0001_extras.sql", import.meta.url).pathname;
  if (existsSync(extras)) {
    const applied = await db.execute(sql`SELECT 1 FROM pg_views WHERE schemaname='platform' AND viewname='cross_schema_fks'`) as any[];
    if (!applied.length) { await db.execute(sql.raw(readFileSync(extras, "utf8"))); console.log("extras applied"); }
  }
  console.log("migrations up to date");
  process.exit(0);
} catch (e) {
  console.error("migration failed:", e);
  process.exit(1);
} finally {
  await db.close();
}
