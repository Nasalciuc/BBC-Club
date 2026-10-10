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
import { applyReferenceFixes, loadAirportsReference } from "./airports-reference";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

const db = createDb(url, { max: 1, applicationName: "bbc-migrate" });
try {
  const [lock] = (await db.execute(sql`SELECT pg_try_advisory_lock(hashtext('bbc.migrate')) AS ok`)) as unknown as {
    ok: boolean;
  }[];
  if (!lock?.ok) {
    console.error("another migration is running");
    process.exit(1);
  }

  // A migration must never queue behind live traffic: every lock it takes waits at most 5 s, then fails (55P03) and
  // the deploy stops with the previous release serving. Session-wide for the statements outside a transaction
  // (Drizzle's migrator, the 0003/0004 re-runs, CONCURRENTLY builds); each transactional block also sets it LOCAL.
  await db.execute(sql`SET lock_timeout = '5s'`);

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
  )) as unknown[];
  if (alreadyExtras.length) {
    await db.execute(
      sql`INSERT INTO platform.extras_applied (name) VALUES ('0001_extras.sql') ON CONFLICT (name) DO NOTHING`,
    );
  }

  const extrasFiles = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.*extras\.sql$/.test(f))
    .sort();
  for (const f of extrasFiles) {
    const done = (await db.execute(sql`SELECT 1 FROM platform.extras_applied WHERE name = ${f}`)) as unknown[];
    if (done.length) continue;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
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
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
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
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
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
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
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
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(requestsPhone, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0008_requests_phone.sql')`);
      });
      console.log("requests phone_e164/phone_valid applied");
    }
  }

  const requestsIntent = join(migrationsDir, "0021_requests_intent.sql");
  if (existsSync(requestsIntent)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0021_requests_intent.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(requestsIntent, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0021_requests_intent.sql')`);
      });
      console.log("requests intent applied");
    }
  }

  // After 0005 (requests schema): the estimate a quote request's search showed. ADR-IMPL-042.
  const requestsShownEstimate = join(migrationsDir, "0024_requests_shown_estimate.sql");
  if (existsSync(requestsShownEstimate)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0024_requests_shown_estimate.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(requestsShownEstimate, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0024_requests_shown_estimate.sql')`);
      });
      console.log("requests shown estimate applied");
    }
  }

  // After 0024: the estimate pair's CHECK, both or neither; the member's list index. ADR-IMPL-042.
  const requestsEstimatePairAndList = join(migrationsDir, "0025_requests_estimate_pair_and_list.sql");
  if (existsSync(requestsEstimatePairAndList)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0025_requests_estimate_pair_and_list.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(requestsEstimatePairAndList, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0025_requests_estimate_pair_and_list.sql')`,
        );
      });
      console.log("requests estimate pair and list applied");
    }
  }

  const notifRequestId = join(migrationsDir, "0009_notifications_request_id.sql");
  if (existsSync(notifRequestId)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0009_notifications_request_id.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
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
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
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
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(otpCooldown, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0011_auth_otp_cooldown.sql')`);
      });
      console.log("auth.otp_cooldown applied");
    }
  }

  /** CREATE INDEX CONCURRENTLY cannot run inside a transaction or as a multi-statement string. */
  const applyConcurrentIndexes = async (name: string, file: string, label: string) => {
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
      for (const stmt of statements) await raw.unsafe(stmt);
      await db.execute(sql`INSERT INTO platform.extras_applied (name) VALUES (${name})`);
      console.log(label);
    } finally {
      await raw.unsafe("SET statement_timeout = '15s'");
    }
  };

  await applyConcurrentIndexes(
    "0012_platform_delivery_stats.sql",
    join(migrationsDir, "0012_platform_delivery_stats.sql"),
    "platform delivery stats indexes applied",
  );
  await applyConcurrentIndexes(
    "0013_catalog_fares_home_destinations.sql",
    join(migrationsDir, "0013_catalog_fares_home_destinations.sql"),
    "catalog fares_home_destinations applied",
  );

  const rateLimitState = join(migrationsDir, "0014_platform_rate_limit_state.sql");
  if (existsSync(rateLimitState)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0014_platform_rate_limit_state.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(rateLimitState, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0014_platform_rate_limit_state.sql')`);
      });
      console.log("platform rate_limit_state applied");
    }
  }

  const sendingEnum = join(migrationsDir, "0015_notifications_sending_enum.sql");
  if (existsSync(sendingEnum)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0015_notifications_sending_enum.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(sendingEnum, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0015_notifications_sending_enum.sql')`,
        );
      });
      console.log("notifications sending status applied");
    }
  }

  const claimedAt = join(migrationsDir, "0016_notifications_claimed_at.sql");
  if (existsSync(claimedAt)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0016_notifications_claimed_at.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(claimedAt, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0016_notifications_claimed_at.sql')`);
      });
      console.log("notifications claimed_at applied");
    }
  }

  await applyConcurrentIndexes(
    "0017_notifications_sending_index.sql",
    join(migrationsDir, "0017_notifications_sending_index.sql"),
    "notifications sending index applied",
  );

  const campaigns = join(migrationsDir, "0018_notifications_campaigns.sql");
  if (existsSync(campaigns)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0018_notifications_campaigns.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(campaigns, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0018_notifications_campaigns.sql')`);
      });
      console.log("notifications campaigns applied");
    }
  }

  const statementTimeout = join(migrationsDir, "0019_platform_statement_timeout.sql");
  if (existsSync(statementTimeout)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0019_platform_statement_timeout.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(statementTimeout, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0019_platform_statement_timeout.sql')`,
        );
      });
      console.log("role statement_timeout applied");
    }
  }

  const pgss = join(migrationsDir, "0020_platform_pg_stat_statements.sql");
  if (existsSync(pgss)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0020_platform_pg_stat_statements.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(pgss, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0020_platform_pg_stat_statements.sql')`,
        );
      });
      console.log("pg_stat_statements applied");
    }
  }

  // After 0006 (catalog schema): pg_trgm, unaccent and airports.search_terms. ADR-IMPL-036.
  const airportsSearch = join(migrationsDir, "0023_catalog_airports_search.sql");
  if (existsSync(airportsSearch)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0023_catalog_airports_search.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(airportsSearch, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0023_catalog_airports_search.sql')`);
      });
      console.log("catalog airports search applied");
    }
  }

  // After 0006 (catalog schema): place photos, a table with a foreign key to catalog.airports. ADR-IMPL-043.
  const placePhotos = join(migrationsDir, "0026_catalog_place_photos.sql");
  if (existsSync(placePhotos)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0026_catalog_place_photos.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(placePhotos, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0026_catalog_place_photos.sql')`);
      });
      console.log("catalog place photos applied");
    }
  }

  // Corrected cities first, only on rows still exactly as the reference inserted them (ADR-IMPL-038); then insert-only:
  // airports that exist (curated seed, catalogue import) keep their values (ADR-IMPL-036).
  const corrected = await applyReferenceFixes(db);
  if (corrected) console.log(`airports reference: ${corrected} corrected`);
  const added = await loadAirportsReference(db);
  if (added) console.log(`airports reference: ${added} added`);

  console.log("migrations up to date");
  process.exit(0);
} catch (e) {
  // Drizzle wraps the driver error: the SQLSTATE is on e.cause.code.
  const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
  if (code === "55P03") {
    console.error(
      "migration stopped: a lock was not granted within lock_timeout (5 s) — a long-running transaction holds the table. " +
        "The failed block was rolled back; the previous release keeps serving. Retry when the table is quiet (RUNBOOK: Database recovery).",
    );
  }
  console.error("migration failed:", e);
  process.exit(1);
} finally {
  await db.close();
}
