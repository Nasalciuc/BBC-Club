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

  const requestsSchema = join(migrationsDir, "0005_requests.sql");
  if (existsSync(requestsSchema)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0005_requests.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(requestsSchema, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0005_requests.sql')`);
      });
      console.log("requests schema applied");
    }
  }

  const catalogSchema = join(migrationsDir, "0006_catalog.sql");
  if (existsSync(catalogSchema)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0006_catalog.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(catalogSchema, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0006_catalog.sql')`);
      });
      console.log("catalog schema applied");
    }
  }

  const verifyFitness = join(migrationsDir, "0007_db_verify_fitness.sql");
  if (existsSync(verifyFitness)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0007_db_verify_fitness.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(verifyFitness, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0007_db_verify_fitness.sql')`);
      });
      console.log("db:verify fitness fixes applied");
    }
  }

  const requestsPhone = join(migrationsDir, "0008_requests_phone.sql");
  if (existsSync(requestsPhone)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0008_requests_phone.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(requestsPhone, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0008_requests_phone.sql')`);
      });
      console.log("requests phone_e164/phone_valid applied");
    }
  }

  const notifRequestId = join(migrationsDir, "0009_notifications_request_id.sql");
  if (existsSync(notifRequestId)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0009_notifications_request_id.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(notifRequestId, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0009_notifications_request_id.sql')`);
      });
      console.log("notifications request_id applied");
    }
  }

  const airportTz = join(migrationsDir, "0010_catalog_airport_tz.sql");
  if (existsSync(airportTz)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0010_catalog_airport_tz.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(airportTz, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0010_catalog_airport_tz.sql')`);
      });
      console.log("catalog airports.tz applied");
    }
  }

  const otpCooldown = join(migrationsDir, "0011_auth_otp_cooldown.sql");
  if (existsSync(otpCooldown)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0011_auth_otp_cooldown.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(otpCooldown, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0011_auth_otp_cooldown.sql')`);
      });
      console.log("auth.otp_cooldown applied");
    }
  }

  const deliveryStats = join(migrationsDir, "0012_platform_delivery_stats.sql");
  if (existsSync(deliveryStats)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0012_platform_delivery_stats.sql'`,
    )) as any[];
    if (!done.length) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(readFileSync(deliveryStats, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0012_platform_delivery_stats.sql')`);
      });
      console.log("platform delivery stats indexes applied");
    }
  }

  console.log("migrations up to date");
  process.exit(0);
} catch (e) {
  console.error("migration failed:", e);
  process.exit(1);
} finally {
  await db.close();
}
