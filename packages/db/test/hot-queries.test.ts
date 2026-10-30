/** Hot queries assert their own index (planOf/usesIndex/seqScans). Volume via generate_series, then ANALYZE. No Total Cost. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";
import { nodes, planOf, seqScans, sqlOf, usesIndex } from "../src/testing/plan";
import { pollerClaimSql, pollerStatsSql } from "@bbc/platform";
import { dispatchClaimSql, dispatchReaperSql } from "../../modules/core/notifications/src/application/dispatch";
import { faresRepo } from "../../modules/domain/catalog/src/infrastructure/fares.repo";
import { claimUnsentSql, createRequestsRepo } from "../../modules/domain/requests/src/infrastructure/requests.repo";
import { notificationsRepo } from "../../modules/core/notifications/src/infrastructure/notifications.repo";
import { offerSendsSelect } from "../../modules/core/notifications/src/application/daily-cap";

const MEMBER = "hot-member";
const ROWS = 200_000;

let iso: IsolatedDb;

async function seedVolume() {
  await iso.db.execute(sql`
    INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity, tz) VALUES
      ('JFK','John F Kennedy','New York','United States','US','americas',40.6413,-73.7781,100,'America/New_York'),
      ('LHR','Heathrow','London','United Kingdom','GB','europe',51.47,-0.4543,98,'Europe/London'),
      ('CDG','Charles de Gaulle','Paris','France','FR','europe',49.0097,2.5479,95,'Europe/Paris'),
      ('FCO','Fiumicino','Rome','Italy','IT','europe',41.8003,12.2389,80,'Europe/Rome'),
      ('DXB','Dubai International','Dubai','United Arab Emirates','AE','middle_east',25.2532,55.3657,92,'Asia/Dubai'),
      ('HND','Haneda','Tokyo','Japan','JP','asia',35.5494,139.7798,94,'Asia/Tokyo')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, country = EXCLUDED.country, country_code = EXCLUDED.country_code, region = EXCLUDED.region, lat = EXCLUDED.lat, lng = EXCLUDED.lng, popularity = EXCLUDED.popularity, tz = EXCLUDED.tz`);
  await iso.db.execute(
    sql.raw(`
    INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, nonstop, price, currency, source, valid_from, valid_until, published)
    SELECT 'JFK', (ARRAY['LHR','CDG','FCO','DXB','HND'])[1 + (g % 5)], 'business', 'BA', true,
           (1000 + g)::numeric(10,2), 'USD', 'manual',
           timestamptz '2026-01-01' + (g || ' seconds')::interval,
           timestamptz '2028-01-01', true
    FROM generate_series(1, 10000) g
    ON CONFLICT (route_from, route_to, cabin, carrier, valid_from, trip) DO NOTHING`),
  );
  await iso.db.execute(
    sql.raw(`
    WITH e AS (
      INSERT INTO platform.domain_events (type, version, aggregate_type, aggregate_id, payload, published_by)
      SELECT 'offer.published', 1, 'offer', 'hot-' || g, '{}'::jsonb, 'hot'
      FROM generate_series(1, ${ROWS}) g
      RETURNING id, occurred_at, aggregate_id
    )
    INSERT INTO platform.event_deliveries (event_id, event_occurred_at, consumer, aggregate_id, status, run_after)
    SELECT id, occurred_at, 'hot', aggregate_id, 'pending', now() FROM e`),
  );
  await iso.db.execute(
    sql.raw(`
    INSERT INTO notifications.notifications (member_id, category, title, status, scheduled_for)
    SELECT '${MEMBER}', 'transactional', 'n', 'pending', now()
    FROM generate_series(1, ${ROWS})`),
  );
  await iso.db.execute(
    sql.raw(`
    INSERT INTO requests.requests (
      reference, member_id, idempotency_key, trip_type, cabin, legs, passengers,
      contact_name, contact_phone, contact_email, source
    )
    SELECT 'HOT' || g, '${MEMBER}', 'hot-idem-' || g, 'oneway', 'business',
           '[{"from":"JFK","to":"LHR","date":"2026-10-12"}]'::jsonb,
           '{"adult":1,"child":0,"infant":0}'::jsonb,
           'Alex', '+12125550148', 'alex@test.dev', 'ios'
    FROM generate_series(1, 20000) g`),
  );
  // As in production: nearly every request has been passed on; one in a hundred still waits for the job.
  await iso.db.execute(
    sql.raw(`UPDATE requests.requests SET sent_to_crm = true, sent_at = now(), crm_request_id = 'crm-' || reference
             WHERE reference LIKE 'HOT%' AND substring(reference from 4)::int % 100 <> 0`),
  );
  await iso.db.execute(sql`ANALYZE`);
}

describe("hot queries choose their index", () => {
  beforeAll(async () => {
    iso = await isolatedDb("db-hot-queries", { max: 2 });
    await seedVolume();
  }, 180_000);

  afterAll(() => iso.drop());

  const HOT: {
    name: string;
    statement: () => ReturnType<typeof sql>;
    index: string;
    noSeqScanOn: string[];
    /** The index already holds the order: no sort over the rows it reads (a sort means every row was read). */
    noSort?: true;
  }[] = [
    {
      name: "poller claim",
      statement: () => pollerClaimSql(50),
      index: "deliveries_ready",
      noSeqScanOn: ["event_deliveries"],
    },
    {
      name: "dispatch claim",
      statement: () => dispatchClaimSql(100),
      index: "notif_dispatch",
      noSeqScanOn: ["notifications"],
    },
    {
      name: "dispatch reaper",
      statement: () => dispatchReaperSql(sql`interval '5 minutes'`),
      index: "notif_sending_claimed",
      noSeqScanOn: ["notifications"],
    },
    {
      name: "destinations(JFK)",
      statement: () => sqlOf(faresRepo.destinationsSelect(iso.db, "JFK")),
      index: "fares_home_destinations",
      noSeqScanOn: ["fares"],
    },
    {
      name: "search JFK→LHR business",
      // After ANALYZE the planner prefers fares_home_destinations (from,to,price) over fares_search.
      statement: () => sqlOf(faresRepo.searchSelect(iso.db, { from: "JFK", to: "LHR", cabin: "business" })),
      index: "fares_home_destinations",
      noSeqScanOn: ["fares"],
    },
    {
      name: "requests by member",
      statement: () => sqlOf(createRequestsRepo(iso.db).listForMemberSelect(iso.db, MEMBER)),
      index: "requests_member_list",
      noSeqScanOn: ["requests"],
      noSort: true,
    },
    {
      name: "send claim",
      statement: () => claimUnsentSql(20),
      index: "requests_unsent",
      noSeqScanOn: ["requests"],
    },
    {
      name: "inbox by member",
      statement: () => sqlOf(notificationsRepo.inboxSelect(iso.db, MEMBER, 30)),
      index: "notif_inbox",
      noSeqScanOn: ["notifications"],
    },
    {
      // The daily offer cap (0044): a member's offer pushes around the new one's send day, never every row they have.
      name: "daily offer cap",
      statement: () =>
        sqlOf(
          offerSendsSelect(
            iso.db,
            [MEMBER, "hot-other"],
            new Date(Date.now() - 36 * 3_600_000),
            new Date(Date.now() + 36 * 3_600_000),
          ),
        ),
      index: "notif_offer_sends",
      noSeqScanOn: ["notifications"],
    },
    {
      name: "delivery stats",
      statement: () => pollerStatsSql(),
      index: "deliveries_pending_created",
      noSeqScanOn: [],
    },
  ];

  // ADR-IMPL-074: named statements are planned once and may be run on the generic plan. A partial index is matched on
  // that plan only when its predicate is written as a literal in the SQL (`eqConst`): `published = $1` would scan.
  // Every index named is partial on `published = true`; which one the generic plan picks depends on the statistics.
  const GENERIC: { name: string; query: () => { toSQL(): { sql: string } }; index: string[]; table: string }[] = [
    {
      name: "destinations(JFK)",
      query: () => faresRepo.destinationsSelect(iso.db, "JFK"),
      index: ["fares_home_destinations", "fares_expiry"],
      table: "fares",
    },
    {
      name: "search JFK→LHR business",
      query: () => faresRepo.searchSelect(iso.db, { from: "JFK", to: "LHR", cabin: "business" }),
      index: ["fares_home_destinations", "fares_search"],
      table: "fares",
    },
  ];
  for (const q of GENERIC) {
    test(`${q.name} on the generic plan`, async () => {
      const text = q.query().toSQL().sql;
      expect(text).not.toMatch(/"published" = \$\d/);
      const rows = (await iso.db.execute(sql.raw(`EXPLAIN (FORMAT JSON, GENERIC_PLAN) ${text}`))) as {
        "QUERY PLAN": { Plan: Parameters<typeof usesIndex>[0] }[];
      }[];
      const p = rows[0]!["QUERY PLAN"][0]!.Plan;
      expect(
        q.index.some((i) => usesIndex(p, i)),
        `${q.name}: generic plan without ${q.index.join(" or ")}`,
      ).toBe(true);
      expect(seqScans(p)).not.toContain(q.table);
    });
  }

  for (const q of HOT) {
    test(
      q.name,
      async () => {
        const p = await planOf(iso.db, q.statement());
        expect(usesIndex(p, q.index), `${q.name} expected index ${q.index}`).toBe(true);
        for (const t of q.noSeqScanOn) expect(seqScans(p)).not.toContain(t);
        if (q.noSort) expect(nodes(p).filter((n) => n["Node Type"].includes("Sort"))).toEqual([]);
      },
      30_000,
    );
  }
});
