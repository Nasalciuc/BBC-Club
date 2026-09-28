import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { loadEnv } from "@bbc/shared/env";
import { buildApp } from "../../src/index";
import { capturingEmail } from "./capturing-email";
import { mockCrm } from "./mock-crm";
import { testAuth } from "./test-auth";
import type { IdentityFacade } from "@bbc/identity";
import type { EngagementFacade } from "@bbc/engagement";

/** The whole host, in-memory (no port), against an isolated clone of the test template, with capturing adapters.
 *  Every suite that needs the system uses this — nobody builds their own wiring.
 *  Pass `suite` to name the isolated DB (and to isolate fixture emails when suites share a process).
 *
 *  Seed rules: never pass validUntil < now to ingest (CHECK offers_valid_after_publish); targeting=user needs
 *  targetMemberId in the same payload; Path A password tests use withPathAPassword (no credential yet). */
export async function testApp(
  opts: {
    knownClients?: Parameters<typeof mockCrm>[0];
    suite?: string;
    poolMax?: number;
    env?: Record<string, string>;
    queryLog?: string[];
  } = {},
) {
  const poolMax = opts.poolMax ?? 6;
  const iso = await isolatedDb(opts.suite ?? "api", {
    max: poolMax,
    logger: opts.queryLog ? { logQuery: (q) => opts.queryLog!.push(q) } : undefined,
  });
  const env = loadEnv({
    ...process.env,
    DATABASE_URL: iso.url,
    // Host .env Metro extras must not leak into NODE_ENV=production suites.
    CORS_ORIGINS: "",
    ...opts.env,
  });
  const db = iso.db;
  const email = capturingEmail();
  const emailA = opts.suite ? `alex.${opts.suite}@test.dev` : "alex.morgan@company.com";
  const emailB = opts.suite ? `bob.${opts.suite}@test.dev` : "bob@test.dev";
  const crm = mockCrm(
    opts.knownClients ?? [
      {
        email: emailA,
        crmClientId: opts.suite ? `crm_alex_${opts.suite}` : "crm_alex",
        fullName: "Alex Morgan",
        homeAirport: "JFK",
      },
    ],
  );
  const push = {
    sent: [] as any[],
    async send(msg: any) {
      this.sent.push(msg);
      return { ok: true, ticketId: `t_${this.sent.length}` };
    },
  };

  let built = await buildApp({ env, db, overrides: { email, crm, push }, startPoller: false });
  let auth = testAuth(built.registry.facade<IdentityFacade>("identity").auth, db);
  const internalSecret = env.INTERNAL_API_SECRET;

  const memberA = { ...(await auth.createMember(emailA)), cookie: "" };
  memberA.cookie = await auth.cookieFor(memberA.email);
  const memberB = { ...(await auth.createMember(emailB)), cookie: "" };
  memberB.cookie = await auth.cookieFor(memberB.email);
  const operatorJwt = await auth.operatorJwt(opts.suite ? `ops.${opts.suite}@test.dev` : "ops@test.dev");
  await built.platform.poller.drainOnce(); // member.registered → profiles

  const api = {
    get app() {
      return built.app;
    },
    db,
    appOrigin: env.APP_ORIGIN,
    get platform() {
      return built.platform;
    },
    get registry() {
      return built.registry;
    },
    email,
    crm,
    push,
    get auth() {
      return auth;
    },
    memberA,
    memberB,
    operatorJwt,
    internalSecret,
    flags: {
      kill: (m: string) => built.platform.flags.set(`${m}.killed`, { enabled: true }),
      revive: (m: string) => built.platform.flags.set(`${m}.killed`, { enabled: false }),
    },
    /** Rebuild the host on the same isolated DB (killswitch / boot-time flags). */
    async restart() {
      // Do not call built.shutdown() — that closes the shared db pool.
      await built.platform.poller.stop();
      built = await buildApp({ env, db, overrides: { email, crm, push }, startPoller: false });
      auth = testAuth(built.registry.facade<IdentityFacade>("identity").auth, db);
      memberA.cookie = await auth.cookieFor(memberA.email);
      memberB.cookie = await auth.cookieFor(memberB.email);
    },
    /** Drive the queue by hand: tests never wait on timers. */
    drainAll: async () => {
      for (let i = 0; i < 20; i++) {
        const n = await built.platform.poller.drainOnce();
        if (n === 0) break;
      }
    },
    /** Invoke one consumer directly with a payload (for handler-level tests). */
    runHandler: async (consumer: string, payload: any) => {
      const [type] = [payload.type];
      const handler = built.platform.events.registry.handlerFor(type, consumer);
      if (!handler) throw new Error(`no handler ${consumer} for ${type}`);
      return db.transaction((tx: any) =>
        handler(
          {
            tx,
            event: {
              id: "0",
              type,
              version: payload.version,
              aggregateType: "test",
              aggregateId: payload.offerId ?? "x",
              memberId: payload.memberId ?? null,
              occurredAt: new Date(),
            },
            principal: { kind: "system", role: "system", source: "handler", actorMemberId: payload.memberId },
            deliveryId: "0",
            logger: built.platform.logger,
            attempt: 1,
            signal: new AbortController().signal,
          },
          payload,
        ),
      );
    },
    // ── seeds (small, explicit) ──
    async seedBroadcastOffer(over: Record<string, unknown> = {}) {
      const key = `test:${crypto.randomUUID()}`;
      const payload = {
        source: "marketing_campaign",
        targeting: "broadcast",
        routeFrom: "JFK",
        routeTo: "CDG",
        cabin: "business",
        price: "3850.00",
        publishedPrice: "6900.00",
        title: "Autumn in Paris",
        validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        ...over,
      };
      const r = await built.app.request("/v1/internal/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": internalSecret,
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      });
      if (r.status !== 200) throw new Error(`seed offer failed: ${r.status} ${await r.text()}`);
      return ((await r.json()) as { offerId: string }).offerId;
    },
    async seedTargetedOffer(memberId: string) {
      return this.seedBroadcastOffer({
        source: "crm_agent",
        targeting: "user",
        targetMemberId: memberId,
        routeTo: "LHR",
        title: "Your October in London",
        price: "4200.00",
        publishedPrice: "7850.00",
      });
    },
    /** Active ingest then mark expired — never seed with validUntil in the past (CHECK). */
    async seedExpiredOffer() {
      const offerId = await this.seedBroadcastOffer();
      await db.execute(
        sql`UPDATE proposals.offers
            SET status = 'expired',
                valid_until = now() - interval '1 hour',
                publish_at = now() - interval '2 hours'
            WHERE id = ${offerId}`,
      );
      return offerId;
    },
    /** Strip credential so setPassword matches Path A (session without password yet). */
    async withPathAPassword(memberId: string) {
      await db.execute(sql`DELETE FROM auth.account WHERE user_id = ${memberId} AND provider_id = 'credential'`);
    },
    async seedNotification(memberId: string) {
      const [{ id }]: any = await db.execute(
        sql`INSERT INTO notifications.notifications (member_id, category, title, status) VALUES (${memberId}, 'transactional', 'Welcome to the club', 'sent') RETURNING id`,
      );
      return id as string;
    },
    /** Direct upsert into engagement.offer_responses (respond HTTP path removed in Branch 3). */
    async upsertResponse(memberId: string, offerId: string, response: "interested" | "dismissed") {
      return built.registry.facade<EngagementFacade>("engagement").upsert(undefined, memberId, offerId, response);
    },
    /** Airports + 3 JFK→LHR business fares for catalog Gate 4. */
    async seedCatalogBasics() {
      await db.execute(sql`
        INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity) VALUES
          ('JFK', 'John F Kennedy International', 'New York', 'United States', 'US', 'americas', 40.6413, -73.7781, 100),
          ('LHR', 'Heathrow', 'London', 'United Kingdom', 'GB', 'europe', 51.47, -0.4543, 98),
          ('CDG', 'Charles de Gaulle', 'Paris', 'France', 'FR', 'europe', 49.0097, 2.5479, 95),
          ('HND', 'Haneda', 'Tokyo', 'Japan', 'JP', 'asia', 35.5494, 139.7798, 94),
          ('DXB', 'Dubai International', 'Dubai', 'United Arab Emirates', 'AE', 'middle_east', 25.2532, 55.3657, 92)
        ON CONFLICT (code) DO NOTHING`);
      const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const from = new Date(Date.now() - 86_400_000).toISOString();
      const carriers = [
        { c: "BA", n: "British Airways", p: "4200.00", pub: "7850.00" },
        { c: "VS", n: "Virgin Atlantic", p: "4350.00", pub: "7900.00" },
        { c: "AA", n: "American Airlines", p: "4490.00", pub: "8100.00" },
      ];
      for (const x of carriers) {
        await db.execute(sql`
          INSERT INTO catalog.fares (
            route_from, route_to, cabin, carrier, carrier_name, product, nonstop, duration_minutes,
            price, published_price, published_source, currency, source, valid_from, valid_until, published
          ) VALUES (
            'JFK', 'LHR', 'business', ${x.c}, ${x.n}, 'Lie-flat', true, 425,
            ${x.p}, ${x.pub}, 'Sabre · test', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true
          )
          ON CONFLICT DO NOTHING`);
      }
      await db.execute(sql`
        INSERT INTO catalog.fares (
          route_from, route_to, cabin, carrier, carrier_name, product, nonstop, duration_minutes,
          price, published_price, published_source, currency, source, valid_from, valid_until, published
        ) VALUES (
          'JFK', 'CDG', 'business', 'AF', 'Air France', 'Lie-flat', true, 440,
          '3850.00', '6900.00', 'Sabre · test', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true
        )
        ON CONFLICT DO NOTHING`);
    },
    async seedExpiredFare() {
      await this.seedCatalogBasics();
      const [{ id }]: any = await db.execute(sql`
        INSERT INTO catalog.fares (
          route_from, route_to, cabin, carrier, carrier_name, nonstop,
          price, currency, source, valid_from, valid_until, published
        ) VALUES (
          'JFK', 'LHR', 'business', 'DL', 'Delta', true,
          '5000.00', 'USD', 'manual',
          now() - interval '10 days', now() - interval '1 day', true
        )
        RETURNING id`);
      return id as string;
    },
    async submitRequestAs(
      m: { cookie: string },
      body: Record<string, unknown>,
      opts: { idempotencyKey?: string; ip?: string } = {},
    ) {
      return built.app.request("/v1/requests", {
        method: "POST",
        headers: {
          Cookie: m.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": opts.idempotencyKey ?? crypto.randomUUID(),
          ...(opts.ip ? { "X-Forwarded-For": `${opts.ip}, 173.245.48.1` } : {}),
          "X-App-Platform": "ios",
          "X-App-Version": "1.0.0",
        },
        body: JSON.stringify(body),
      });
    },
    sampleRequestBody(over: Record<string, unknown> = {}) {
      return {
        tripType: "round",
        cabin: "business",
        legs: [
          { from: "JFK", to: "LHR", date: "2026-10-12" },
          { from: "LHR", to: "JFK", date: "2026-10-19" },
        ],
        passengers: { adult: 1, child: 0, infant: 0 },
        contact: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
        priceAtRequest: 4200,
        ...over,
      };
    },
    // ── assertions helpers ──
    countResponses: async (offerId: string) =>
      (
        (await db.execute(
          sql`SELECT count(*)::int n FROM engagement.offer_responses WHERE offer_id = ${offerId}`,
        )) as any
      )[0].n as number,
    responseOwner: async (offerId: string) =>
      (
        (await db.execute(
          sql`SELECT member_id FROM engagement.offer_responses WHERE offer_id = ${offerId} LIMIT 1`,
        )) as any
      )[0]?.member_id as string,
    isRead: async (id: string) =>
      (
        (await db.execute(
          sql`SELECT read_at IS NOT NULL AS r FROM notifications.notifications WHERE id = ${id}`,
        )) as any
      )[0].r as boolean,
    seedMemberData: async (memberId: string) => {
      await db.execute(
        sql`INSERT INTO notifications.device_tokens (member_id, device_id, platform, native_token) VALUES (${memberId}, 'dev-1', 'ios', ${"tok_" + memberId}) ON CONFLICT DO NOTHING`,
      );
      await db.execute(
        sql`INSERT INTO notifications.notifications (member_id, category, title, status) VALUES (${memberId}, 'transactional', 'x', 'sent')`,
      );
    },
    journal: {
      byType: async (type: string) =>
        (await db.execute(sql`SELECT payload FROM platform.domain_events WHERE type = ${type}`)) as any[],
      forMember: async (memberId: string) =>
        (await db.execute(sql`SELECT payload FROM platform.domain_events WHERE member_id = ${memberId}`)) as any[],
    },
    /** Connections in the pool that are not idle — used to assert a consumer is not holding SKIP LOCKED. */
    poolBusy: async () => {
      const [{ busy }]: any = await db.execute(sql`
        SELECT count(*)::int AS busy
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state IS DISTINCT FROM 'idle'`);
      return Number(busy);
    },
    poolMax,
    close: async () => {
      await built.shutdown();
      await iso.drop();
    },
  };
  return api;
}
