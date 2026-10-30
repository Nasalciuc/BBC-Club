/** Hot queries assert their own index (planOf/usesIndex/seqScans). Volume via generate_series, then ANALYZE. No Total Cost. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";
import { nodes, planOf, seqScans, sqlOf, usesIndex } from "../src/testing/plan";
import { lastFinishedRunsSql, lastRunsSql, pollerClaimSql, pollerStatsSql } from "@bbc/platform";
import { deleteBatchSql } from "../src/helpers";
import { jobRunsRetention } from "../../modules/platform/src/jobs/builtin";
import { jobRuns } from "../../modules/platform/src/infrastructure/schema";
import { notificationsRetention } from "../../modules/core/notifications/src/module";
import { notificationsTable } from "../src/schema/notifications";
import { discoveryRepo } from "../../modules/domain/catalog/src/infrastructure/discovery.repo";
import { dispatchClaimSql, dispatchReaperSql } from "../../modules/core/notifications/src/application/dispatch";
import { faresRepo } from "../../modules/domain/catalog/src/infrastructure/fares.repo";
import { claimUnsentSql, createRequestsRepo } from "../../modules/domain/requests/src/infrastructure/requests.repo";
import { notificationsRepo } from "../../modules/core/notifications/src/infrastructure/notifications.repo";
import { offerSendsSelect } from "../../modules/core/notifications/src/application/daily-cap";

const MEMBER = "hot-member";
/** The search as /v1/search sends it: the airports' zones from memory, bound once (ADR-IMPL-077, #114). */
const SEARCH = {
  from: "JFK",
  to: "LHR",
  cabin: "business" as const,
  originTz: "America/New_York",
  destTz: "Europe/London",
};
/** A travel day as the app sends it (noon UTC of the chosen day), within the volume's fares. */
const SEARCH_DAY = new Date(Date.now() + 7 * 86_400_000);
/** The jobs the seed's runs belong to. */
const JOBS = ["dispatch", "campaign-fanout", "send-requests", "resolve-place-photos", "db-observe", "retention"];
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
  // ADR-IMPL-077: the tables that grow by the day — a year of job runs (six jobs, one a minute each would be 3.1 million;
  // 300 000 keep the test quick and the plans the same), a month of demand for 200 origins and 40 destinations each
  // (8 000 routes a day: where the origin-first index wins, 2.6× fewer buffers, measured), and Better Auth's rate-limit
  // rows of 50 000 addresses.
  await iso.db.execute(
    sql.raw(`
    INSERT INTO platform.job_runs (job, status, started_at, finished_at, duration_ms)
    SELECT (ARRAY['dispatch','campaign-fanout','send-requests','resolve-place-photos','db-observe','retention'])[1 + (g % 6)],
           'succeeded', now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval, 10
    FROM generate_series(1, 300000) g`),
  );
  await iso.db.execute(
    sql.raw(`
    INSERT INTO catalog.demand_daily (day, route_from, route_to, cabin, searches, searches_without_fare)
    SELECT date_trunc('day', now()) - (d || ' days')::interval, lpad(o::text, 3, '0'), lpad(t::text, 3, '0'),
           'business', 1 + (d % 7), 0
    FROM generate_series(0, 29) d, generate_series(1, 200) o, generate_series(1, 40) t
    ON CONFLICT DO NOTHING`),
  );
  await iso.db.execute(
    sql.raw(`
    INSERT INTO auth.rate_limit (id, key, count, last_request)
    SELECT 'rl-' || g, '10.0.' || (g / 256) || '.' || (g % 256) || '/sign-in/email', 1, 0
    FROM generate_series(1, 50000) g`),
  );
  // Better Auth's codes, by address, and the accounts, by when they were made (0048): 50 000 of each.
  await iso.db.execute(
    sql.raw(`
    INSERT INTO auth.verification (id, identifier, value, expires_at)
    SELECT 'v-' || g, 'sign-in-otp-' || g || '@hot.test', 'h', now() + interval '10 minutes'
    FROM generate_series(1, 50000) g`),
  );
  await iso.db.execute(
    sql.raw(`
    INSERT INTO auth."user" (id, name, email, email_verified, created_at)
    SELECT 'u-' || g, 'Hot ' || g, 'hot-' || g || '@hot.test', true, now() - (g || ' minutes')::interval
    FROM generate_series(1, 50000) g`),
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
      // What /v1/search sends: the airports' zones bound (from memory), so no airport is read per fare. After ANALYZE
      // the planner prefers fares_home_destinations (from,to,price) over fares_search.
      statement: () => sqlOf(faresRepo.searchSelect(iso.db, SEARCH)),
      index: "fares_home_destinations",
      noSeqScanOn: ["fares"],
    },
    {
      name: "search JFK→LHR business on a day",
      // The travel day's two instants computed once from the origin's zone; depart_at compared bare (ADR-IMPL-077).
      statement: () => sqlOf(faresRepo.searchSelect(iso.db, { ...SEARCH, when: SEARCH_DAY })),
      index: "fares_home_destinations",
      noSeqScanOn: ["fares"],
    },
    {
      name: "a quote's estimate: any fare on sale JFK→LHR business",
      statement: () => sqlOf(faresRepo.anyOnSaleSelect(iso.db, SEARCH)),
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
      // ADR-IMPL-077: /status's last run per job — one probe per job, newest first, never a sort of the table.
      name: "last run per job",
      statement: () => lastRunsSql(JOBS),
      index: "job_runs_job_started",
      noSeqScanOn: ["job_runs"],
      noSort: true,
    },
    {
      // ADR-IMPL-077: /status's last finished run per job — on its own index, read from the top, no sort (0054).
      name: "last finished run per job",
      statement: () => lastFinishedRunsSql(JOBS),
      index: "job_runs_last_finished",
      noSeqScanOn: ["job_runs"],
      noSort: true,
    },
    {
      // ADR-IMPL-077: the retention's finished runs — each job's last finished one probed on job_runs_last_finished,
      // with no sort. Which rows it looks at is the planner's: a Seq Scan of job_runs is allowed (the table is old).
      name: "retention: finished job runs",
      statement: () => deleteBatchSql(jobRuns, jobRunsRetention.finished),
      index: "job_runs_last_finished",
      noSeqScanOn: [],
      noSort: true,
    },
    {
      // ADR-IMPL-077: the retention's other runs — a newer run of the job probed on job_runs_job_started.
      name: "retention: other job runs",
      statement: () => deleteBatchSql(jobRuns, jobRunsRetention.others),
      index: "job_runs_job_started",
      noSeqScanOn: [],
      noSort: true,
    },
    {
      // ADR-IMPL-077: retention-notifications — what reached its end 90 days ago, on its partial index (0054).
      name: "retention: notifications",
      statement: () => deleteBatchSql(notificationsTable, notificationsRetention),
      index: "notifications_retention",
      noSeqScanOn: ["notifications"],
      noSort: true,
    },
    {
      // ADR-IMPL-077: Better Auth checks a code by the address it went to (0048).
      name: "auth verification by identifier",
      statement: () => sql`SELECT * FROM auth.verification WHERE identifier = ${"sign-in-otp-7001@hot.test"}`,
      index: "verification_identifier",
      noSeqScanOn: ["verification"],
    },
    {
      // ADR-IMPL-077: members' reconcile — the accounts made before a moment, newest first
      // (identity's listUsersCreatedBefore, the same SQL), every 15 minutes (0048).
      name: "auth users created before",
      statement: () =>
        sql`SELECT id, email, created_at FROM auth."user" WHERE created_at < ${new Date(Date.now() - 86_400_000).toISOString()}::timestamptz
            ORDER BY created_at DESC LIMIT 5000`,
      index: "user_created_at",
      noSeqScanOn: ["user"],
      noSort: true,
    },
    {
      // ADR-IMPL-077: "Popular from" — one origin's last seven days, on the origin-first index (0049).
      name: "searched from an origin",
      statement: () =>
        sqlOf(discoveryRepo.searchedFromSelect(iso.db, "007", new Date(Date.now() - 7 * 86_400_000), 5, 12)),
      index: "demand_daily_from_day",
      noSeqScanOn: ["demand_daily"],
    },
    {
      // ADR-IMPL-077: Better Auth reads a request's rate-limit row by key, on every /api/auth/* request (0048).
      name: "auth rate limit by key",
      statement: () => sql`SELECT * FROM auth.rate_limit WHERE key = ${"10.0.1.7/sign-in/email"}`,
      index: "rate_limit_key",
      noSeqScanOn: ["rate_limit"],
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
      query: () => faresRepo.searchSelect(iso.db, SEARCH),
      index: ["fares_home_destinations", "fares_search"],
      table: "fares",
    },
    {
      name: "search JFK→LHR business on a day",
      query: () => faresRepo.searchSelect(iso.db, { ...SEARCH, when: SEARCH_DAY }),
      index: ["fares_home_destinations", "fares_search"],
      table: "fares",
    },
    {
      name: "a quote's estimate: any fare on sale JFK→LHR business",
      query: () => faresRepo.anyOnSaleSelect(iso.db, SEARCH),
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
