/** Applies pending migrations. Exit codes: 0 applied/nothing, 1 failure (never 0 on error).
 *  Runs as a separate job BEFORE the API restarts (expand/contract). Serialized by an advisory lock so two
 *  deploys cannot race. `NNNN_*extras.sql` files are applied via `platform.extras_applied` (one file, one
 *  marker); repair scripts that are not `*extras*` still run idempotently after. */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb } from "../src/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

const db = createDb(url, { max: 1, applicationName: "bbc-migrate" });
try {
  const [{ ok }] = (await db.execute(sql`SELECT pg_try_advisory_lock(hashtext('bbc.migrate')) AS ok`)) as any;
  if (!ok) {
    console.error("another migration is running");
    process.exit(1);
  }

  await migrate(db, { migrationsFolder: migrationsDir });

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform.extras_applied (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  // Expand path for DBs that already have the table without created_at (verify § created_at).
  await db.execute(sql`
    ALTER TABLE platform.extras_applied ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`);

  // DBs that already ran 0001 via the old view heuristic: record without re-running (partition rename is not idempotent).
  const alreadyExtras = (await db.execute(
    sql`SELECT 1 FROM pg_views WHERE schemaname='platform' AND viewname='cross_schema_fks'`,
  )) as any[];
  if (alreadyExtras.length) {
    await db.execute(
      sql`INSERT INTO platform.extras_applied (name) VALUES ('0001_extras.sql') ON CONFLICT (name) DO NOTHING`,
    );
  }

  const extrasFiles = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.*extras\.sql$/.test(f))
    .sort();
  for (const f of extrasFiles) {
    const done = (await db.execute(sql`SELECT 1 FROM platform.extras_applied WHERE name = ${f}`)) as any[];
    if (done.length) continue;
    await db.transaction(async (tx: any) => {
      await tx.execute(sql.raw(readFileSync(join(migrationsDir, f), "utf8")));
      await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES (${f})`);
    });
    console.log(`extras applied: ${f}`);
  }

  // Idempotent repair: restores domain_events_id_seq when an older 0001 CASCADE-dropped it.
  const repair = join(migrationsDir, "0003_platform_repair_journal_sequence.sql");
  if (existsSync(repair)) {
    await db.execute(sql.raw(readFileSync(repair, "utf8")));
    console.log("journal sequence repair applied");
  }

  const rateLimitFix = join(migrationsDir, "0004_auth_rate_limit_bigint.sql");
  if (existsSync(rateLimitFix)) {
    await db.execute(sql.raw(readFileSync(rateLimitFix, "utf8")));
    console.log("auth.rate_limit.last_request → bigint");
  }

  console.log("migrations up to date");
  process.exit(0);
} catch (e) {
  console.error("migration failed:", e);
  process.exit(1);
} finally {
  await db.close();
}
