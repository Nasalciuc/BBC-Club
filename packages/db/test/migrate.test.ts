import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("db-migrate", { fromTemplate: false, max: 1 });
  db = iso.db;
});
afterAll(() => iso.drop());

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function runMigrate(): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", "scripts/migrate.ts"], {
      cwd: pkgRoot,
      env: { ...process.env, DATABASE_URL: iso.url },
      shell: true,
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (out += String(d)));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

describe("extras ledger", () => {
  it("second migrate applies nothing; ensure_event_partitions exists; ledger has 0001, 0005–0011", async () => {
    const first = await runMigrate();
    expect(first.code).toBe(0);

    const indexes: any[] = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'deliveries_pending_created',
        'deliveries_dead',
        'deliveries_paused',
        'fares_home_destinations',
        'notif_sending_claimed'
      )
      ORDER BY indexname`);
    expect(indexes.map((r) => r.indexname)).toEqual([
      "deliveries_dead",
      "deliveries_paused",
      "deliveries_pending_created",
      "fares_home_destinations",
      "notif_sending_claimed",
    ]);

    const second = await runMigrate();
    expect(second.code).toBe(0);
    expect(second.out).not.toMatch(/extras applied: 0001/);
    expect(second.out).not.toMatch(/requests schema applied/);
    expect(second.out).not.toMatch(/catalog schema applied/);
    expect(second.out).not.toMatch(/db:verify fitness fixes applied/);
    expect(second.out).not.toMatch(/requests phone_e164\/phone_valid applied/);
    expect(second.out).not.toMatch(/requests intent applied/);
    expect(second.out).not.toMatch(/notifications request_id applied/);
    expect(second.out).not.toMatch(/catalog airports.tz applied/);
    expect(second.out).not.toMatch(/auth.otp_cooldown applied/);
    expect(second.out).not.toMatch(/platform delivery stats indexes applied/);
    expect(second.out).not.toMatch(/catalog fares_home_destinations applied/);
    expect(second.out).not.toMatch(/platform rate_limit_state applied/);
    expect(second.out).not.toMatch(/notifications sending status applied/);
    expect(second.out).not.toMatch(/notifications claimed_at applied/);
    expect(second.out).not.toMatch(/notifications sending index applied/);
    expect(second.out).not.toMatch(/notifications campaigns applied/);
    expect(second.out).not.toMatch(/role statement_timeout applied/);
    expect(second.out).not.toMatch(/pg_stat_statements applied/);

    await db.execute(sql`SELECT platform.ensure_event_partitions(1)`);

    const names: any[] = await db.execute(sql`SELECT name FROM platform.extras_applied ORDER BY name`);
    expect(names.map((r) => r.name)).toEqual([
      "0001_extras.sql",
      "0005_requests.sql",
      "0006_catalog.sql",
      "0007_db_verify_fitness.sql",
      "0008_requests_phone.sql",
      "0009_notifications_request_id.sql",
      "0010_catalog_airport_tz.sql",
      "0011_auth_otp_cooldown.sql",
      "0012_platform_delivery_stats.sql",
      "0013_catalog_fares_home_destinations.sql",
      "0014_platform_rate_limit_state.sql",
      "0015_notifications_sending_enum.sql",
      "0016_notifications_claimed_at.sql",
      "0017_notifications_sending_index.sql",
      "0018_notifications_campaigns.sql",
      "0019_platform_statement_timeout.sql",
      "0020_platform_pg_stat_statements.sql",
      "0021_requests_intent.sql",
      "0022_platform_kafka_processed_extras.sql",
      "0023_catalog_airports_search.sql",
    ]);
    const demand: { rel: string | null }[] = await db.execute(
      sql`SELECT to_regclass('catalog.demand_daily')::text AS rel`,
    );
    expect(demand[0]?.rel).toBe("catalog.demand_daily");
  });
});
