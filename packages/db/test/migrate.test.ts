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
  it("second migrate applies nothing; ensure_event_partitions exists; the ledger has every named step", async () => {
    const first = await runMigrate();
    expect(first.code).toBe(0);

    const indexes: any[] = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'deliveries_pending_created',
        'deliveries_dead',
        'deliveries_paused',
        'fares_home_destinations',
        'notif_sending_claimed',
        'place_photos_due',
        'requests_member_list',
        'site_places_airport',
        'site_routes_cms_id'
      )
      ORDER BY indexname`);
    expect(indexes.map((r) => r.indexname)).toEqual([
      "deliveries_dead",
      "deliveries_paused",
      "deliveries_pending_created",
      "fares_home_destinations",
      "notif_sending_claimed",
      "place_photos_due",
      "requests_member_list",
      "site_places_airport",
      "site_routes_cms_id",
    ]);

    const second = await runMigrate();
    expect(second.code).toBe(0);
    expect(second.out).not.toMatch(/extras applied: 0001/);
    expect(second.out).not.toMatch(/requests schema applied/);
    expect(second.out).not.toMatch(/catalog schema applied/);
    expect(second.out).not.toMatch(/db:verify fitness fixes applied/);
    expect(second.out).not.toMatch(/requests phone_e164\/phone_valid applied/);
    expect(second.out).not.toMatch(/requests intent applied/);
    expect(second.out).not.toMatch(/requests shown estimate applied/);
    expect(second.out).not.toMatch(/requests estimate pair and list applied/);
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
    expect(second.out).not.toMatch(/catalog place photos applied/);
    expect(second.out).not.toMatch(/journal sequence repair applied/);
    expect(second.out).not.toMatch(/auth.rate_limit.last_request → bigint/);
    expect(second.out).not.toMatch(/role idle_in_transaction timeout applied/);
    expect(second.out).not.toMatch(/requests carrier at request applied/);

    await db.execute(sql`SELECT platform.ensure_event_partitions(1)`);

    const names: any[] = await db.execute(sql`SELECT name FROM platform.extras_applied ORDER BY name`);
    expect(names.map((r) => r.name)).toEqual([
      "0001_extras.sql",
      "0003_platform_repair_journal_sequence.sql",
      "0004_auth_rate_limit_bigint.sql",
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
      "0024_requests_shown_estimate.sql",
      "0025_requests_estimate_pair_and_list.sql",
      "0026_catalog_place_photos.sql",
      "0027_platform_idle_in_transaction_timeout.sql",
      "0028_catalog_site_destinations.sql",
      "0029_requests_published_at_request.sql",
      "0030_requests_carrier_at_request.sql",
    ]);
    const demand: { rel: string | null }[] = await db.execute(
      sql`SELECT to_regclass('catalog.demand_daily')::text AS rel`,
    );
    expect(demand[0]?.rel).toBe("catalog.demand_daily");
  });

  // ADR-IMPL-042: both or neither. A CHECK passes when its expression is NULL, so each half of a pair is tried alone.
  it("requests_shown_estimate takes both or neither, a positive amount, USD only", async () => {
    expect((await runMigrate()).code).toBe(0);
    let n = 0;
    const insert = async (amount: number | null, currency: string | null) => {
      n += 1;
      try {
        await db.execute(sql`
          INSERT INTO requests.requests (id, reference, idempotency_key, trip_type, cabin, legs, passengers,
            contact_name, contact_phone, contact_email, source, shown_estimate_amount, shown_estimate_currency)
          VALUES (gen_random_uuid(), ${`R-CHECK${n}`}, ${`check-${n}`}, 'round', 'business',
            '[{"from":"JFK","to":"ZRH","date":"2027-10-12"}]'::jsonb, '{"adult":1,"child":0,"infant":0}'::jsonb,
            'Alex Morgan', '+12125550148', 'alex@test.dev', 'ios', ${amount}, ${currency})`);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert(null, null)).toBe("ok");
    expect(await insert(2055, "USD")).toBe("ok");
    expect(await insert(null, "USD")).toBe("23514");
    expect(await insert(2055, null)).toBe("23514");
    expect(await insert(0, "USD")).toBe("23514");
    expect(await insert(2055, "EUR")).toBe("23514");
  });

  // ADR-IMPL-046: a struck price always carries its source — both or neither, each half tried alone.
  it("requests_published_at_request takes both or neither, a positive amount, a source that says something", async () => {
    expect((await runMigrate()).code).toBe(0);
    let n = 0;
    const insert = async (amount: string | null, source: string | null) => {
      n += 1;
      try {
        await db.execute(sql`
          INSERT INTO requests.requests (id, reference, idempotency_key, trip_type, cabin, legs, passengers,
            contact_name, contact_phone, contact_email, source, published_at_request, published_source_at_request)
          VALUES (gen_random_uuid(), ${`R-PUB${n}`}, ${`published-${n}`}, 'round', 'business',
            '[{"from":"JFK","to":"LHR","date":"2027-10-12"}]'::jsonb, '{"adult":1,"child":0,"infant":0}'::jsonb,
            'Alex Morgan', '+12125550148', 'alex@test.dev', 'ios', ${amount}::numeric, ${source})`);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert(null, null)).toBe("ok");
    expect(await insert("7850.00", "BA published · 16 Sep")).toBe("ok");
    expect(await insert(null, "BA published · 16 Sep")).toBe("23514");
    expect(await insert("7850.00", null)).toBe("23514");
    expect(await insert("0", "BA published · 16 Sep")).toBe("23514");
    expect(await insert("7850.00", "  ")).toBe("23514");
    // Added NOT VALID, then validated in its own transaction: the rows there were are checked too.
    const [validated] = (await db.execute(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'requests_published_at_request'`,
    )) as unknown as { convalidated: boolean }[];
    expect(validated?.convalidated).toBe(true);
  });

  // ADR-IMPL-056: the airline a request was made for — a code never without the name the member read.
  it("requests_carrier_at_request takes a name alone or with its code, never a code alone or a blank name", async () => {
    expect((await runMigrate()).code).toBe(0);
    let n = 0;
    const insert = async (code: string | null, name: string | null) => {
      n += 1;
      try {
        await db.execute(sql`
          INSERT INTO requests.requests (id, reference, idempotency_key, trip_type, cabin, legs, passengers,
            contact_name, contact_phone, contact_email, source, carrier_at_request, carrier_name_at_request)
          VALUES (gen_random_uuid(), ${`R-CAR${n}`}, ${`carrier-${n}`}, 'round', 'business',
            '[{"from":"JFK","to":"LHR","date":"2027-10-12"}]'::jsonb, '{"adult":1,"child":0,"infant":0}'::jsonb,
            'Alex Morgan', '+12125550148', 'alex@test.dev', 'ios', ${code}, ${name})`);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert(null, null)).toBe("ok");
    expect(await insert("BA", "British Airways")).toBe("ok");
    expect(await insert(null, "British Airways")).toBe("ok");
    expect(await insert("BA", null)).toBe("23514");
    expect(await insert("BA", "  ")).toBe("23514");
    expect(await insert(null, "")).toBe("23514");
    // Added NOT VALID, then validated in its own transaction: the rows there were are checked too.
    const [validated] = (await db.execute(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'requests_carrier_at_request'`,
    )) as unknown as { convalidated: boolean }[];
    expect(validated?.convalidated).toBe(true);
  });
});
