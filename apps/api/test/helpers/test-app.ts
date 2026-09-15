import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { loadEnv } from "@bbc/shared/env";
import { buildApp } from "../../src/index";
import { capturingEmail } from "./capturing-email";
import { mockCrm } from "./mock-crm";
import { testAuth } from "./test-auth";

/** The whole host, in-memory (no port), against an isolated clone of the test template, with capturing adapters.
 *  Every suite that needs the system uses this — nobody builds their own wiring.
 *  Pass `suite` to name the isolated DB (and to isolate fixture emails when suites share a process). */
export async function testApp(opts: { knownClients?: Parameters<typeof mockCrm>[0]; suite?: string } = {}) {
  const iso = await isolatedDb(opts.suite ?? "api", { max: 6 });
  const env = loadEnv({ ...process.env, DATABASE_URL: iso.url });
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
  let auth = testAuth(built.registry.facade<any>("identity").auth, db);
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
      auth = testAuth(built.registry.facade<any>("identity").auth, db);
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
    async seedNotification(memberId: string) {
      const [{ id }]: any = await db.execute(
        sql`INSERT INTO notifications.notifications (member_id, category, title, status) VALUES (${memberId}, 'transactional', 'Welcome to the club', 'sent') RETURNING id`,
      );
      return id as string;
    },
    async respondAs(m: { cookie: string }, offerId: string, response: "interested" | "dismissed") {
      return built.app.request(`/v1/proposals/${offerId}/respond`, {
        method: "POST",
        headers: { Cookie: m.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
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
    close: async () => {
      await built.shutdown();
      await iso.drop();
    },
  };
  return api;
}
