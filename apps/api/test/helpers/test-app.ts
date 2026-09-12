import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { loadEnv } from "@bbc/shared/env";
import { buildApp } from "../../src/index";
import { capturingEmail } from "./capturing-email";
import { mockCrm } from "./mock-crm";
import { testAuth } from "./test-auth";

/** The whole host, in-memory (no port), against postgres-test, with capturing adapters.
 *  Every suite that needs the system uses this — nobody builds their own wiring. */
export async function testApp(opts: { knownClients?: Parameters<typeof mockCrm>[0] } = {}) {
  const env = loadEnv(process.env);
  const db = createDb(env.DATABASE_URL, { max: 6, applicationName: "bbc-test" });
  const email = capturingEmail();
  const crm = mockCrm(opts.knownClients ?? [{ email: "alex.morgan@company.com", crmClientId: "crm_alex", fullName: "Alex Morgan", homeAirport: "JFK" }]);
  const push = { sent: [] as any[], async send(msg: any) { this.sent.push(msg); return { ok: true, ticketId: `t_${this.sent.length}` }; } };

  const built = await buildApp({ env, db, overrides: { email, crm, push }, startPoller: false });
  const auth = testAuth(built.registry.facade<any>("identity").auth, db);
  const internalSecret = env.INTERNAL_API_SECRET;

  const memberA = { ...(await auth.createMember("alex.morgan@company.com")), cookie: "" };
  memberA.cookie = await auth.cookieFor(memberA.email);
  const memberB = { ...(await auth.createMember("bob@test.dev")), cookie: "" };
  memberB.cookie = await auth.cookieFor(memberB.email);
  const operatorJwt = await auth.operatorJwt();
  await built.platform.poller.drainOnce();                 // member.registered → profiles

  const json = (body: unknown) => ({ "Content-Type": "application/json", body: JSON.stringify(body) });

  return {
    app: built.app, db, platform: built.platform, registry: built.registry, email, crm, push, auth,
    memberA, memberB, operatorJwt, internalSecret,
    flags: {
      kill: (m: string) => built.platform.flags.set(`${m}.killed`, { enabled: true }),
      revive: (m: string) => built.platform.flags.set(`${m}.killed`, { enabled: false }),
    },
    /** Drive the queue by hand: tests never wait on timers. */
    drainAll: () => built.platform.poller.drainOnce(),
    /** Invoke one consumer directly with a payload (for handler-level tests). */
    runHandler: async (consumer: string, payload: any) => {
      const [type] = [payload.type];
      const handler = built.platform.events.registry.handlerFor(type, consumer);
      if (!handler) throw new Error(`no handler ${consumer} for ${type}`);
      return db.transaction((tx: any) => handler({ tx, event: { id: "0", type, version: payload.version, aggregateType: "test", aggregateId: payload.offerId ?? "x", memberId: payload.memberId ?? null, occurredAt: new Date() }, principal: { kind: "system", role: "system", source: "handler", actorMemberId: payload.memberId }, logger: built.platform.logger, attempt: 1 }, payload));
    },
    // ── seeds (small, explicit) ──
    async seedBroadcastOffer(over: Record<string, unknown> = {}) {
      const key = `test:${crypto.randomUUID()}`;
      const r = await built.app.request("/v1/internal/offers", { method: "POST", headers: { "X-Internal-Secret": internalSecret, "Idempotency-Key": key, ...json({ source: "marketing_campaign", targeting: "broadcast", routeFrom: "JFK", routeTo: "CDG", cabin: "business", price: "3850.00", publishedPrice: "6900.00", title: "Autumn in Paris", validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(), ...over }) } });
      if (r.status !== 200) throw new Error(`seed offer failed: ${r.status} ${await r.text()}`);
      return (await r.json()).offerId as string;
    },
    async seedTargetedOffer(memberId: string) {
      return this.seedBroadcastOffer({ source: "crm_agent", targeting: "user", targetMemberId: memberId, routeTo: "LHR", title: "Your October in London", price: "4200.00", publishedPrice: "7850.00" });
    },
    async seedNotification(memberId: string) {
      const [{ id }]: any = await db.execute(sql`INSERT INTO notifications.notifications (member_id, category, title, status) VALUES (${memberId}, 'transactional', 'Welcome to the club', 'sent') RETURNING id`);
      return id as string;
    },
    async respondAs(m: { cookie: string }, offerId: string, response: "interested" | "dismissed") {
      return built.app.request(`/v1/proposals/${offerId}/respond`, { method: "POST", headers: { Cookie: m.cookie, ...json({ response }) } });
    },
    // ── assertions helpers ──
    countResponses: async (offerId: string) => (await db.execute(sql`SELECT count(*)::int n FROM engagement.offer_responses WHERE offer_id = ${offerId}`) as any)[0].n as number,
    responseOwner: async (offerId: string) => (await db.execute(sql`SELECT member_id FROM engagement.offer_responses WHERE offer_id = ${offerId} LIMIT 1`) as any)[0]?.member_id as string,
    isRead: async (id: string) => (await db.execute(sql`SELECT read_at IS NOT NULL AS r FROM notifications.notifications WHERE id = ${id}`) as any)[0].r as boolean,
    seedMemberData: async (memberId: string) => {
      await db.execute(sql`INSERT INTO notifications.device_tokens (member_id, device_id, platform, native_token) VALUES (${memberId}, 'dev-1', 'ios', ${"tok_" + memberId}) ON CONFLICT DO NOTHING`);
      await db.execute(sql`INSERT INTO notifications.notifications (member_id, category, title, status) VALUES (${memberId}, 'transactional', 'x', 'sent')`);
    },
    journal: {
      byType: async (type: string) => (await db.execute(sql`SELECT payload FROM platform.domain_events WHERE type = ${type}`)) as any[],
      forMember: async (memberId: string) => (await db.execute(sql`SELECT payload FROM platform.domain_events WHERE member_id = ${memberId}`)) as any[],
    },
    close: async () => { await built.shutdown(); },
  };
}
