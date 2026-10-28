/** Applies pending migrations. Exit codes: 0 applied/nothing, 1 failure (never 0 on error).
 *  Runs as a separate job BEFORE the API restarts (expand/contract). Serialized by an advisory lock so two
 *  deploys cannot race. Every numbered file is applied once and recorded in `platform.extras_applied` (one file,
 *  one marker): `NNNN_*extras.sql` by the loop below, every other file by a named block. */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb } from "../src/client";
import { applyReferenceFixes, loadAirportsReference } from "./airports-reference";
import { applyConcurrentIndexFile } from "./concurrent-indexes";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

/** Why a pending step would fail half-way, one line each; empty when every pending step can run. Reads only. */
async function preflight(exec: ReturnType<typeof createDb>): Promise<string[]> {
  const [state] = (await exec.execute(sql`
    SELECT to_regclass('platform.extras_applied') IS NOT NULL AS ledger,
           to_regclass('catalog.airports') IS NOT NULL AS airports`)) as unknown as {
    ledger: boolean;
    airports: boolean;
  }[];
  if (!state?.ledger || !state.airports) return []; // a new database: every step runs on empty tables
  const pending = async (name: string) =>
    ((await exec.execute(sql`SELECT 1 FROM platform.extras_applied WHERE name = ${name}`)) as unknown[]).length === 0;
  const lines: string[] = [];
  // 0035 validates airports_coordinates: an airport off the globe would stop it after 0034 had committed.
  if (await pending("0035_catalog_checks.sql")) {
    const off = (await exec.execute(sql`
      SELECT code, lat::text AS lat, lng::text AS lng FROM catalog.airports
      WHERE NOT (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180) ORDER BY code`)) as unknown as {
      code: string;
      lat: string;
      lng: string;
    }[];
    for (const a of off) {
      lines.push(
        `0035: airport ${a.code} is off the globe (lat ${a.lat}, lng ${a.lng}): re-import it with its real coordinates`,
      );
    }
  }
  return lines;
}

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
  // (Drizzle's migrator, CONCURRENTLY builds); each transactional block also sets it LOCAL.
  await db.execute(sql`SET lock_timeout = '5s'`);

  // Check first, change nothing until the checks pass: a pending step that would stop half-way is refused before any
  // step runs, so an earlier one is never left applied alone (0034 committed, then 0035's VALIDATE failed and 0036
  // never ran).
  const refused = await preflight(db);
  if (refused.length) {
    for (const line of refused) console.error(line);
    console.error("migration not started: nothing was changed. Fix the rows above, then run the migration again.");
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

  // Repairs, once per database like every other file. Both used to run on every deploy, and each run took an ACCESS
  // EXCLUSIVE lock — on the event journal (0003) and on Better Auth's rate limit table (0004) — for nothing.
  // 0003 restores domain_events_id_seq when an older 0001 CASCADE-dropped it.
  const repair = join(migrationsDir, "0003_platform_repair_journal_sequence.sql");
  if (existsSync(repair)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0003_platform_repair_journal_sequence.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(repair, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0003_platform_repair_journal_sequence.sql')`,
        );
      });
      console.log("journal sequence repair applied");
    }
  }

  const rateLimitFix = join(migrationsDir, "0004_auth_rate_limit_bigint.sql");
  if (existsSync(rateLimitFix)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0004_auth_rate_limit_bigint.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(rateLimitFix, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0004_auth_rate_limit_bigint.sql')`);
      });
      console.log("auth.rate_limit.last_request → bigint");
    }
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

  // After 0005 (requests schema): the fare's published price and its source when the member asked. ADR-IMPL-046.
  const requestsPublishedAtRequest = join(migrationsDir, "0029_requests_published_at_request.sql");
  if (existsSync(requestsPublishedAtRequest)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0029_requests_published_at_request.sql'`,
    )) as unknown[];
    if (!done.length) {
      // Two transactions: the columns and the CHECK as NOT VALID take the table's lock for a moment, with no scan
      // under it; the scan that validates the rows runs next, under a lock writes do not wait for. The file is
      // idempotent, so a run stopped between the two picks up from the start.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(requestsPublishedAtRequest, "utf8")));
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE requests.requests VALIDATE CONSTRAINT requests_published_at_request`);
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0029_requests_published_at_request.sql')`,
        );
      });
      console.log("requests published at request applied");
    }
  }

  // After 0005 (requests schema): the airline a fare request was made for, as its fare named it. ADR-IMPL-056.
  const requestsCarrierAtRequest = join(migrationsDir, "0030_requests_carrier_at_request.sql");
  if (existsSync(requestsCarrierAtRequest)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0030_requests_carrier_at_request.sql'`,
    )) as unknown[];
    if (!done.length) {
      // Two transactions, as 0029: the columns and the CHECK as NOT VALID, then the scan that validates the rows.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(requestsCarrierAtRequest, "utf8")));
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE requests.requests VALIDATE CONSTRAINT requests_carrier_at_request`);
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0030_requests_carrier_at_request.sql')`,
        );
      });
      console.log("requests carrier at request applied");
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

  await applyConcurrentIndexFile(
    db,
    "0012_platform_delivery_stats.sql",
    join(migrationsDir, "0012_platform_delivery_stats.sql"),
    "platform delivery stats indexes applied",
  );
  await applyConcurrentIndexFile(
    db,
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

  await applyConcurrentIndexFile(
    db,
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

  // A role setting, like 0019: every new session of bbc gets it, through PgBouncer too. ADR-IMPL-044.
  const idleInTransaction = join(migrationsDir, "0027_platform_idle_in_transaction_timeout.sql");
  if (existsSync(idleInTransaction)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0027_platform_idle_in_transaction_timeout.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(idleInTransaction, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0027_platform_idle_in_transaction_timeout.sql')`,
        );
      });
      console.log("role idle_in_transaction timeout applied");
    }
  }

  // After 0006 (catalog schema): the site's destinations, two tables with foreign keys to catalog.airports. ADR-IMPL-045.
  const siteDestinations = join(migrationsDir, "0028_catalog_site_destinations.sql");
  if (existsSync(siteDestinations)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0028_catalog_site_destinations.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(siteDestinations, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0028_catalog_site_destinations.sql')`);
      });
      console.log("catalog site destinations applied");
    }
  }

  // After 0006 (catalog schema): the trip a fare's price is for, and a destination's one line. ADR-IMPL-056.
  const fareTripAndAirportDescription = join(migrationsDir, "0031_catalog_fare_trip_and_airport_description.sql");
  if (existsSync(fareTripAndAirportDescription)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0031_catalog_fare_trip_and_airport_description.sql'`,
    )) as unknown[];
    if (!done.length) {
      // Two transactions, as 0029: the type, the columns and the CHECK as NOT VALID, then the scan that validates it.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(fareTripAndAirportDescription, "utf8")));
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE catalog.airports VALIDATE CONSTRAINT airports_description`);
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0031_catalog_fare_trip_and_airport_description.sql')`,
        );
      });
      console.log("catalog fare trip and airport description applied");
    }
  }

  // proposals.offers comes from drizzle's first migration, which ran above: an offer's rating. ADR-IMPL-056.
  const offerRating = join(migrationsDir, "0032_proposals_offer_rating.sql");
  if (existsSync(offerRating)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0032_proposals_offer_rating.sql'`,
    )) as unknown[];
    if (!done.length) {
      // Two transactions, as 0029: the column and the CHECK as NOT VALID, then the scan that validates it.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(offerRating, "utf8")));
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE proposals.offers VALIDATE CONSTRAINT offers_rating`);
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0032_proposals_offer_rating.sql')`);
      });
      console.log("proposals offer rating applied");
    }
  }

  // members.profile comes from drizzle's first migration, which ran above: the member's photo. ADR-IMPL-056.
  const profileAvatarUrl = join(migrationsDir, "0033_members_profile_avatar_url.sql");
  if (existsSync(profileAvatarUrl)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0033_members_profile_avatar_url.sql'`,
    )) as unknown[];
    if (!done.length) {
      // Two transactions, as 0029: the column and the CHECK as NOT VALID, then the scan that validates it.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(profileAvatarUrl, "utf8")));
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE members.profile VALIDATE CONSTRAINT profile_avatar_url`);
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0033_members_profile_avatar_url.sql')`,
        );
      });
      console.log("members profile avatar url applied");
    }
  }

  // Before 0034, on purpose (ADR-IMPL-061): which copy of a duplicate fare stays — the one on sale, not the one
  // expire-fares touched last. Only while 0034 has not run; on a database that ran it the key already holds, and this
  // step is recorded without running.
  const faresKeepLive = join(migrationsDir, "0037_catalog_fares_keep_live_copy.sql");
  if (existsSync(faresKeepLive)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0037_catalog_fares_keep_live_copy.sql'`,
    )) as unknown[];
    if (!done.length) {
      const keyDone = (await db.execute(
        sql`SELECT 1 FROM platform.extras_applied WHERE name = '0034_catalog_fares_key.sql'`,
      )) as unknown[];
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        if (!keyDone.length) await tx.execute(sql.raw(readFileSync(faresKeepLive, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0037_catalog_fares_keep_live_copy.sql')`,
        );
      });
      console.log(`catalog fares keep live copy ${keyDone.length ? "recorded (0034 had run)" : "applied"}`);
    }
  }

  // After 0006 and 0031 (catalog.fares and its trip): the fares key — trip in it, a NULL carrier not distinct, the
  // duplicates the old key let in collapsed. One transaction: the table is small, its lock held for the rebuild.
  const faresKey = join(migrationsDir, "0034_catalog_fares_key.sql");
  if (existsSync(faresKey)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0034_catalog_fares_key.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(faresKey, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0034_catalog_fares_key.sql')`);
      });
      console.log("catalog fares key applied");
    }
  }

  // After 0006 (catalog schema): a fare's duration above zero or none, an airport's coordinates on the globe.
  const catalogChecks = join(migrationsDir, "0035_catalog_checks.sql");
  if (existsSync(catalogChecks)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0035_catalog_checks.sql'`,
    )) as unknown[];
    if (!done.length) {
      // Two transactions, as 0029: the stored durations fixed and the CHECKs as NOT VALID, then the scans that
      // validate them.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(catalogChecks, "utf8")));
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE catalog.fares VALIDATE CONSTRAINT fares_duration_pos`);
        await tx.execute(sql`ALTER TABLE catalog.airports VALIDATE CONSTRAINT airports_coordinates`);
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0035_catalog_checks.sql')`);
      });
      console.log("catalog checks applied");
    }
  }

  // After 0018 (notifications.campaigns): a broadcast offer published for later is pushed then (g5-offer-push-at-publish).
  const campaignNotBefore = join(migrationsDir, "0036_notifications_campaign_not_before.sql");
  if (existsSync(campaignNotBefore)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0036_notifications_campaign_not_before.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(campaignNotBefore, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0036_notifications_campaign_not_before.sql')`,
        );
      });
      console.log("notifications campaign not before applied");
    }
  }

  // After 0006 and 0031 (the catalog schema and catalog.fare_trip): what the company's site answered for a route.
  // ADR-IMPL-063.
  const sitePrices = join(migrationsDir, "0038_catalog_site_prices.sql");
  if (existsSync(sitePrices)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0038_catalog_site_prices.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(sitePrices, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0038_catalog_site_prices.sql')`);
      });
      console.log("catalog site prices applied");
    }
  }

  // After 0006 (catalog schema): landmarks, a table with a foreign key to catalog.airports, and the outside sources'
  // holds. ADR-IMPL-064.
  const placeLandmarks = join(migrationsDir, "0039_catalog_place_landmarks.sql");
  if (existsSync(placeLandmarks)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0039_catalog_place_landmarks.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(placeLandmarks, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0039_catalog_place_landmarks.sql')`);
      });
      console.log("catalog place landmarks applied");
    }
  }

  // After 0005 and 0025 (the requests schema and its estimate pair): who priced the estimate a quote carries.
  // ADR-IMPL-063.
  const shownEstimateSource = join(migrationsDir, "0040_requests_shown_estimate_source.sql");
  if (existsSync(shownEstimateSource)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0040_requests_shown_estimate_source.sql'`,
    )) as unknown[];
    if (!done.length) {
      // Two transactions, as 0029: the column and the CHECK as NOT VALID, then the scan that validates it.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(shownEstimateSource, "utf8")));
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`ALTER TABLE requests.requests VALIDATE CONSTRAINT requests_shown_estimate_source`);
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0040_requests_shown_estimate_source.sql')`,
        );
      });
      console.log("requests shown estimate source applied");
    }
  }

  // After 0028 (catalog.site_routes): the day a site deal is shown for. ADR-IMPL-067. One transaction: the table holds
  // about 1,500 rows, so the backfill, NOT NULL and the CHECK's scan take milliseconds under the lock.
  const siteRouteValidity = join(migrationsDir, "0042_catalog_site_route_validity.sql");
  if (existsSync(siteRouteValidity)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0042_catalog_site_route_validity.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(siteRouteValidity, "utf8")));
        await tx.execute(
          sql`INSERT INTO platform.extras_applied (name) VALUES ('0042_catalog_site_route_validity.sql')`,
        );
      });
      console.log("catalog site route validity applied");
    }
  }

  // After drizzle's own migrations (members.profile): the photo the member adds themselves (ADR-IMPL-070). A new table,
  // one transaction.
  const membersPhoto = join(migrationsDir, "0043_members_photo.sql");
  if (existsSync(membersPhoto)) {
    const done = (await db.execute(
      sql`SELECT 1 FROM platform.extras_applied WHERE name = '0043_members_photo.sql'`,
    )) as unknown[];
    if (!done.length) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql.raw(readFileSync(membersPhoto, "utf8")));
        await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES ('0043_members_photo.sql')`);
      });
      console.log("members photo applied");
    }
  }

  // After Drizzle's migrations (notifications.notifications): the daily offer cap reads a member's offer pushes by the
  // time they are sent, in a window around the new one (daily-cap.ts). CONCURRENTLY, outside a transaction: pushes keep
  // being written while it builds.
  await applyConcurrentIndexFile(
    db,
    "0044_notifications_offer_send_day.sql",
    join(migrationsDir, "0044_notifications_offer_send_day.sql"),
    "notifications offer send day index applied",
  );

  // After platform.flags (0001) and the catalogue's tables: one counter per reference table, bumped by a trigger in the
  // statement that writes it (ADR-IMPL-075). Platform's table and function first, then the catalogue's triggers and the
  // airports' popularity index (3 900 rows: built under the lock in milliseconds), then the offers' triggers. One
  // transaction each.
  for (const [file, done] of [
    ["0045_platform_generations.sql", "platform generations applied"],
    ["0046_catalog_generations.sql", "catalog generations applied"],
    ["0047_proposals_generations.sql", "proposals generations applied"],
  ] as const) {
    const path = join(migrationsDir, file);
    if (!existsSync(path)) continue;
    const applied = (await db.execute(sql`SELECT 1 FROM platform.extras_applied WHERE name = ${file}`)) as unknown[];
    if (applied.length) continue;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql.raw(readFileSync(path, "utf8")));
      await tx.execute(sql`INSERT INTO platform.extras_applied (name) VALUES (${file})`);
    });
    console.log(done);
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
