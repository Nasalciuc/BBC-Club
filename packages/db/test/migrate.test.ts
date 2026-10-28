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
        'place_landmarks_one_marker',
        'place_photos_due',
        'requests_member_list',
        'site_places_airport',
        'site_prices_due',
        'site_routes_cms_id'
      )
      ORDER BY indexname`);
    expect(indexes.map((r) => r.indexname)).toEqual([
      "deliveries_dead",
      "deliveries_paused",
      "deliveries_pending_created",
      "fares_home_destinations",
      "notif_sending_claimed",
      "place_landmarks_one_marker",
      "place_photos_due",
      "requests_member_list",
      "site_places_airport",
      "site_prices_due",
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
    expect(second.out).not.toMatch(/catalog fare trip and airport description applied/);
    expect(second.out).not.toMatch(/proposals offer rating applied/);
    expect(second.out).not.toMatch(/members profile avatar url applied/);
    expect(second.out).not.toMatch(/catalog fares key applied/);
    expect(second.out).not.toMatch(/catalog checks applied/);
    expect(second.out).not.toMatch(/notifications campaign not before applied/);
    expect(second.out).not.toMatch(/catalog fares keep live copy/);
    expect(second.out).not.toMatch(/catalog place landmarks applied/);
    expect(second.out).not.toMatch(/catalog site prices applied/);
    expect(second.out).not.toMatch(/requests shown estimate source applied/);
    expect(second.out).not.toMatch(/catalog site route validity applied/);
    expect(second.out).not.toMatch(/members photo applied/);

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
      "0031_catalog_fare_trip_and_airport_description.sql",
      "0032_proposals_offer_rating.sql",
      "0033_members_profile_avatar_url.sql",
      "0034_catalog_fares_key.sql",
      "0035_catalog_checks.sql",
      "0036_notifications_campaign_not_before.sql",
      "0037_catalog_fares_keep_live_copy.sql",
      "0038_catalog_site_prices.sql",
      "0039_catalog_place_landmarks.sql",
      "0040_requests_shown_estimate_source.sql",
      "0042_catalog_site_route_validity.sql",
      "0043_members_photo.sql",
      "0044_notifications_offer_send_day.sql",
      "0045_platform_generations.sql",
      "0046_catalog_generations.sql",
      "0047_proposals_generations.sql",
      "0048_identity_auth_lookups.sql",
      "0049_catalog_demand_from_route.sql",
      "0050_platform_autovacuum.sql",
      "0051_notifications_autovacuum.sql",
      "0052_platform_monitor_role.sql",
      "0053_platform_monitor_role_limits.sql",
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

  // ADR-IMPL-063: who priced a quote's estimate — only beside an estimate, only the site or the club's formula.
  it("requests_shown_estimate_source takes site or club beside an estimate, or none", async () => {
    // Made-up amounts.
    expect((await runMigrate()).code).toBe(0);
    let n = 0;
    const insert = async (amount: number | null, source: string | null) => {
      n += 1;
      try {
        await db.execute(sql`
          INSERT INTO requests.requests (id, reference, idempotency_key, trip_type, cabin, legs, passengers,
            contact_name, contact_phone, contact_email, source, shown_estimate_amount, shown_estimate_currency,
            shown_estimate_source)
          VALUES (gen_random_uuid(), ${`R-SRC${n}`}, ${`estimate-source-${n}`}, 'round', 'business',
            '[{"from":"JFK","to":"ZRH","date":"2027-10-12"}]'::jsonb, '{"adult":1,"child":0,"infant":0}'::jsonb,
            'Alex Morgan', '+12125550148', 'alex@test.dev', 'ios', ${amount}, ${amount === null ? null : "USD"},
            ${source})`);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert(null, null)).toBe("ok");
    expect(await insert(2222, null)).toBe("ok"); // an estimate stored before the site priced any: the formula's
    expect(await insert(2222, "site")).toBe("ok");
    expect(await insert(2222, "club")).toBe("ok");
    expect(await insert(null, "site")).toBe("23514"); // a source without an estimate
    expect(await insert(2222, "formula")).toBe("23514");
    expect(await insert(2222, "")).toBe("23514");
    // Added NOT VALID, then validated in its own transaction: the rows there were are checked too.
    const [validated] = (await db.execute(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'requests_shown_estimate_source'`,
    )) as unknown as { convalidated: boolean }[];
    expect(validated?.convalidated).toBe(true);
  });

  // ADR-IMPL-067, D6: a site deal is served for at most a day after the read that wrote it.
  it("catalog.site_routes: valid until the read + 24 hours at most, after it, by default the day", async () => {
    expect((await runMigrate()).code).toBe(0);
    await db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports)
      VALUES (23, 'London', 'United Kingdom', 'Europe', 'LHR', ARRAY['LHR'])
      ON CONFLICT (cms_id) DO NOTHING`);
    const insert = async (from: string, validUntil: string | null) => {
      try {
        // Made-up prices.
        if (validUntil === null) {
          await db.execute(sql`
            INSERT INTO catalog.site_routes (route_from, cms_id, deal, price) VALUES (${from}, 23, 9001, 1111)`);
        } else {
          await db.execute(sql`
            INSERT INTO catalog.site_routes (route_from, cms_id, deal, price, synced_at, valid_until)
            VALUES (${from}, 23, 9001, 1111, now(), now() + ${validUntil}::interval)`);
        }
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert("JFK", "24 hours")).toBe("ok");
    expect(await insert("EWR", null)).toBe("ok"); // a binary from before 0042: the default, the read + 24 hours
    expect(await insert("LGA", "25 hours")).toBe("23514"); // D6: never longer than a day
    expect(await insert("ORD", "0 seconds")).toBe("23514");
    expect(await insert("MDW", "-1 hour")).toBe("23514");
    const [ewr] = (await db.execute(sql`
      SELECT valid_until = synced_at + interval '24 hours' AS day FROM catalog.site_routes WHERE route_from = 'EWR'`)) as unknown as {
      day: boolean;
    }[];
    expect(ewr?.day).toBe(true);
    await db.execute(sql`DELETE FROM catalog.site_routes WHERE cms_id = 23`);
  });

  // ADR-IMPL-067: the rows a database holds when 0042 runs get their own read + 24 hours — a row read two days ago is
  // expired at once, one read two hours ago keeps its day — never the migration's own day.
  it("0042 gives the rows already there their own read + 24 hours", async () => {
    expect((await runMigrate()).code).toBe(0);
    // The table as it was before 0042, with two nights' rows (made-up prices).
    await db.execute(sql`ALTER TABLE catalog.site_routes DROP CONSTRAINT site_routes_validity`);
    await db.execute(sql`ALTER TABLE catalog.site_routes DROP COLUMN valid_until`);
    await db.execute(sql`DELETE FROM platform.extras_applied WHERE name = '0042_catalog_site_route_validity.sql'`);
    await db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports)
      VALUES (23, 'London', 'United Kingdom', 'Europe', 'LHR', ARRAY['LHR'])
      ON CONFLICT (cms_id) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO catalog.site_routes (route_from, cms_id, deal, price, synced_at) VALUES
        ('JFK', 23, 9001, 1111, now() - interval '2 days'), ('ORD', 23, 9002, 1222, now() - interval '2 hours')`);

    const run = await runMigrate();
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/catalog site route validity applied/);
    const rows = (await db.execute(sql`
      SELECT route_from, valid_until = synced_at + interval '24 hours' AS own_day, valid_until > now() AS served
      FROM catalog.site_routes WHERE cms_id = 23 ORDER BY route_from`)) as unknown as {
      route_from: string;
      own_day: boolean;
      served: boolean;
    }[];
    expect(rows.map((r) => [r.route_from.trim(), r.own_day, r.served])).toEqual([
      ["JFK", true, false],
      ["ORD", true, true],
    ]);
    const [check] = (await db.execute(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'site_routes_validity'`,
    )) as unknown as { convalidated: boolean }[];
    expect(check?.convalidated).toBe(true);
    await db.execute(sql`DELETE FROM catalog.site_routes WHERE cms_id = 23`);
  });

  // ADR-IMPL-063, D6: what the site answered, shown for at most 24 hours; a priced row has its business figure.
  it("catalog.site_prices: priced or none, figures above zero, never the same airport, 24 hours at most", async () => {
    expect((await runMigrate()).code).toBe(0);
    const insert = async (
      row: Partial<{ from: string; to: string; status: string; business: number | null; first: number | null }>,
      expires = "24 hours",
    ) => {
      const r = { from: "JFK", to: "ZRH", status: "priced", business: 2222, first: null, ...row };
      try {
        // Made-up figures.
        await db.execute(sql`
          INSERT INTO catalog.site_prices (route_from, route_to, trip, status, business, first, fetched_at, expires_at)
          VALUES (${r.from}, ${r.to}, 'round_trip', ${r.status}::catalog.site_price_status, ${r.business}, ${r.first},
            now(), now() + ${expires}::interval)
          ON CONFLICT (route_from, route_to, trip) DO NOTHING`);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert({})).toBe("ok");
    expect(await insert({ to: "CDG", status: "none", business: null })).toBe("ok");
    expect(await insert({ to: "LHR" }, "25 hours")).toBe("23514"); // D6: older than 24 hours is never shown
    expect(await insert({ to: "LHR" }, "0 seconds")).toBe("23514");
    expect(await insert({ to: "LHR", business: null })).toBe("23514"); // priced without its business figure
    expect(await insert({ to: "LHR", status: "none" })).toBe("23514"); // none with a figure
    expect(await insert({ to: "LHR", business: 0 })).toBe("23514");
    expect(await insert({ to: "LHR", first: -5 })).toBe("23514");
    expect(await insert({ to: "JFK" })).toBe("23514"); // the site prices JFK → JFK; the club never stores it
    expect(await insert({ to: "LHR", status: "unknown" })).toBe("22P02"); // an enum
    await db.execute(sql`DELETE FROM catalog.site_prices WHERE route_from = 'JFK'`);
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

  // ADR-IMPL-056: a fare is one way unless the catalogue says round trip; a destination's line says something, briefly.
  it("catalog.fares.trip is one way by default and an enum; airports_description takes 1 to 160 characters", async () => {
    expect((await runMigrate()).code).toBe(0);
    const code = async (q: ReturnType<typeof sql>) => {
      try {
        await db.execute(q);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    const fare = (carrier: string, trip: string | null) => sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, price, valid_until${trip === null ? sql`` : sql`, trip`})
      VALUES ('JFK', 'LHR', 'business', ${carrier}, '4200.00', now() + interval '30 days'${
        trip === null ? sql`` : sql`, ${trip}::catalog.fare_trip`
      })`;
    expect(await code(fare("BA", null))).toBe("ok");
    expect(await code(fare("VS", "round_trip"))).toBe("ok");
    expect(await code(fare("AA", "return"))).toBe("22P02"); // not a label of the enum
    const trips = (await db.execute(
      sql`SELECT carrier, trip FROM catalog.fares WHERE carrier IN ('BA', 'VS') ORDER BY carrier`,
    )) as unknown as { carrier: string; trip: string }[];
    expect(trips).toEqual([
      { carrier: "BA", trip: "one_way" },
      { carrier: "VS", trip: "round_trip" },
    ]);

    const line = (text: string | null) => sql`UPDATE catalog.airports SET description = ${text} WHERE code = 'LHR'`;
    const [lhr] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM catalog.airports WHERE code = 'LHR'`,
    )) as unknown as { n: number }[];
    expect(lhr?.n).toBe(1); // the reference airports (migrate.ts) have it: each update below writes one row
    expect(await code(line(null))).toBe("ok");
    expect(await code(line("Iconic sights, world-class culture and unforgettable experiences."))).toBe("ok");
    expect(await code(line("x".repeat(160)))).toBe("ok");
    expect(await code(line(` ${"x".repeat(160)} `))).toBe("ok"); // counted once the spaces around it are left out
    expect(await code(line("x".repeat(161)))).toBe("23514");
    expect(await code(line(""))).toBe("23514");
    expect(await code(line("   "))).toBe("23514");
    // Added NOT VALID, then validated in its own transaction: the rows there were are checked too.
    const [validated] = (await db.execute(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'airports_description'`,
    )) as unknown as { convalidated: boolean }[];
    expect(validated?.convalidated).toBe(true);
  });

  // ADR-IMPL-056: an offer's rating, one to five stars — on a table drizzle's own first migration creates.
  it("offers_rating takes one to five, to one decimal place, or none", async () => {
    expect((await runMigrate()).code).toBe(0);
    let n = 0;
    const insert = async (rating: string | null) => {
      n += 1;
      try {
        await db.execute(sql`
          INSERT INTO proposals.offers (idempotency_key, source, targeting, route_from, route_to, cabin, price, title,
            valid_until, rating)
          VALUES (${`rating-${n}`}, 'marketing_campaign', 'broadcast', 'JFK', 'CDG', 'business', '3850.00',
            'Autumn in Paris', now() + interval '7 days', ${rating}::numeric)`);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert(null)).toBe("ok");
    expect(await insert("4.8")).toBe("ok");
    expect(await insert("1.0")).toBe("ok");
    expect(await insert("5.0")).toBe("ok");
    expect(await insert("5.1")).toBe("23514");
    expect(await insert("0.9")).toBe("23514");
    const [stored] = (await db.execute(
      sql`SELECT rating FROM proposals.offers WHERE idempotency_key = 'rating-2'`,
    )) as unknown as { rating: string }[];
    expect(stored?.rating).toBe("4.8");
    // Added NOT VALID, then validated in its own transaction: the rows there were are checked too.
    const [validated] = (await db.execute(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'offers_rating'`,
    )) as unknown as { convalidated: boolean }[];
    expect(validated?.convalidated).toBe(true);
  });

  // 0034: a fare is one per route, cabin, carrier, valid_from and trip — a fare without a carrier included (NULLS NOT
  // DISTINCT). The duplicates an import left behind are collapsed to the most recently updated row.
  it("fares_route_cabin_carrier: trip in the key, a NULL carrier not distinct, older duplicates collapsed", async () => {
    expect((await runMigrate()).code).toBe(0);
    const code = async (q: ReturnType<typeof sql>) => {
      try {
        await db.execute(q);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    // The key as 0006 had it, and what three imports of a carrier-less fare left under it.
    await db.execute(sql`ALTER TABLE catalog.fares DROP CONSTRAINT fares_route_cabin_carrier`);
    await db.execute(sql`CREATE UNIQUE INDEX fares_route_cabin_carrier
      ON catalog.fares (route_from, route_to, cabin, carrier, valid_from)`);
    const fare = (price: string, updated: string, carrier: string | null = null) => sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, price, valid_from, valid_until, updated_at)
      VALUES ('KEF', 'AMS', 'business', ${carrier}, ${price}, '2026-10-01T00:00:00Z', now() + interval '30 days',
        ${updated}::timestamptz)`;
    expect(await code(fare("2100.00", "2026-10-02T00:00:00Z"))).toBe("ok");
    expect(await code(fare("2100.00", "2026-10-03T00:00:00Z"))).toBe("ok");
    expect(await code(fare("1999.00", "2026-10-04T00:00:00Z"))).toBe("ok");
    expect(await code(fare("2500.00", "2026-10-01T00:00:00Z", "FI"))).toBe("ok");
    await db.execute(sql`DELETE FROM platform.extras_applied WHERE name = '0034_catalog_fares_key.sql'`);

    const again = await runMigrate();
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/catalog fares key applied/);
    const kept = (await db.execute(
      sql`SELECT coalesce(carrier, '-') AS carrier, price::text FROM catalog.fares WHERE route_from = 'KEF' AND route_to = 'AMS' ORDER BY carrier NULLS FIRST`,
    )) as unknown as { carrier: string; price: string }[];
    expect(kept).toEqual([
      { carrier: "-", price: "1999.00" },
      { carrier: "FI", price: "2500.00" },
    ]);
    // Now a constraint, NULLS NOT DISTINCT, with the trip in it.
    const [def] = (await db.execute(sql`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'fares_route_cabin_carrier'`)) as unknown as {
      def: string;
    }[];
    expect(def?.def).toBe("UNIQUE NULLS NOT DISTINCT (route_from, route_to, cabin, carrier, valid_from, trip)");
    expect(await code(fare("1800.00", "2026-10-05T00:00:00Z"))).toBe("23505");
    const roundTrip = sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, price, valid_from, valid_until, trip)
      VALUES ('KEF', 'AMS', 'business', NULL, '3500.00', '2026-10-01T00:00:00Z', now() + interval '30 days',
        'round_trip')`;
    expect(await code(roundTrip)).toBe("ok");
  });

  // 0035: a fare's duration is whole minutes above zero or none (FareVM refuses anything else, and with it the route's
  // whole search); an airport stands on the globe. A duration of 0 or less already stored becomes none.
  it("fares_duration_pos and airports_coordinates: added, the rows there were fixed and validated", async () => {
    expect((await runMigrate()).code).toBe(0);
    const code = async (q: ReturnType<typeof sql>) => {
      try {
        await db.execute(q);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    // What an import could store before: a fare at 0 minutes, another at -5.
    await db.execute(sql`ALTER TABLE catalog.fares DROP CONSTRAINT fares_duration_pos`);
    const fare = (carrier: string, minutes: number | null) => sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, price, duration_minutes, valid_until)
      VALUES ('KEF', 'CPH', 'business', ${carrier}, '1400.00', ${minutes}, now() + interval '30 days')`;
    expect(await code(fare("FI", 0))).toBe("ok");
    expect(await code(fare("SK", -5))).toBe("ok");
    expect(await code(fare("DY", 180))).toBe("ok");
    await db.execute(sql`DELETE FROM platform.extras_applied WHERE name = '0035_catalog_checks.sql'`);

    const again = await runMigrate();
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/catalog checks applied/);
    const minutes = (await db.execute(
      sql`SELECT carrier, duration_minutes FROM catalog.fares WHERE route_to = 'CPH' ORDER BY carrier`,
    )) as unknown as { carrier: string; duration_minutes: number | null }[];
    expect(minutes).toEqual([
      { carrier: "DY", duration_minutes: 180 },
      { carrier: "FI", duration_minutes: null },
      { carrier: "SK", duration_minutes: null },
    ]);
    expect(await code(fare("LH", 0))).toBe("23514");
    expect(await code(fare("LX", null))).toBe("ok");

    const coords = (lat: number, lng: number) =>
      sql`UPDATE catalog.airports SET lat = ${lat}, lng = ${lng} WHERE code = 'KEF'`;
    expect(await code(coords(63.985, -22.6056))).toBe("ok");
    expect(await code(coords(90, 180))).toBe("ok");
    expect(await code(coords(-90, -180))).toBe("ok");
    expect(await code(coords(90.5, 0))).toBe("23514");
    expect(await code(coords(0, -180.5))).toBe("23514");

    // Added NOT VALID, then validated in its own transaction: the rows there were are checked too.
    const validated = (await db.execute(
      sql`SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('fares_duration_pos', 'airports_coordinates') ORDER BY conname`,
    )) as unknown as { conname: string; convalidated: boolean }[];
    expect(validated).toEqual([
      { conname: "airports_coordinates", convalidated: true },
      { conname: "fares_duration_pos", convalidated: true },
    ]);
  });

  // ADR-IMPL-056: the member's photo is only ever an https address — on a table drizzle's own first migration creates.
  it("profile_avatar_url takes an https address or none", async () => {
    expect((await runMigrate()).code).toBe(0);
    let n = 0;
    const insert = async (url: string | null) => {
      n += 1;
      try {
        await db.execute(sql`INSERT INTO members.profile (member_id, avatar_url) VALUES (${`avatar-${n}`}, ${url})`);
        return "ok";
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        return e.code ?? e.cause?.code ?? "error";
      }
    };
    expect(await insert(null)).toBe("ok");
    expect(await insert("https://cdn.example.com/members/daniel.webp")).toBe("ok");
    expect(await insert("http://cdn.example.com/members/daniel.webp")).toBe("23514");
    expect(await insert("javascript:alert(1)")).toBe("23514");
    expect(await insert("data:image/png;base64,iVBORw0KGgo=")).toBe("23514");
    expect(await insert(" https://cdn.example.com/members/daniel.webp")).toBe("23514");
    expect(await insert("")).toBe("23514");
    // Added NOT VALID, then validated in its own transaction: the rows there were are checked too.
    const [validated] = (await db.execute(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'profile_avatar_url'`,
    )) as unknown as { convalidated: boolean }[];
    expect(validated?.convalidated).toBe(true);
  });
});
