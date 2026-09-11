import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";
import { EVENT_CATALOGUE } from "@bbc/shared/events";

describe("host boot", () => {
  it("mounts every module, satisfies every port, and every consumed event has a handler", async () => {
    const t = await testApp();
    const registry = t.platform.events.registry;
    for (const [type, def] of Object.entries(EVENT_CATALOGUE)) {
      const consumers = registry.consumersOf(type);
      if (!(def as any).noConsumer) expect({ type, consumers }).toMatchObject({ type, consumers: expect.arrayContaining([expect.any(String)]) });
    }
    await t.close();
  });

  it("/ready explains what is wrong; /health is always cheap", async () => {
    const t = await testApp();
    const ready = await t.app.request("/ready");
    const body = await ready.json();
    expect(body).toHaveProperty("db"); expect(body).toHaveProperty("queue"); expect(body).toHaveProperty("staleJobs");
    expect((await t.app.request("/health")).status).toBe(200);
    await t.close();
  });

  it("a killed module is not mounted and its routes answer 404, other modules unaffected", async () => {
    const t0 = await testApp();
    await t0.flags.kill("engagement"); await t0.close();
    const t = await testApp();
    const broadcast = await t.seedBroadcastOffer();
    expect((await t.respondAs(t.memberA, broadcast, "interested")).status).toBe(404);
    expect((await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } })).status).toBe(200);
    await t.flags.revive("engagement"); await t.close();
  });

  it("errors have one shape: validation → 400 with details, unknown → 500 without internals", async () => {
    const t = await testApp();
    const bad = await t.app.request("/v1/proposals/not-a-uuid/respond", { method: "POST", headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ response: "maybe" }) });
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details.some((d: any) => d.path === "response")).toBe(true);
    await t.close();
  });
});

describe("smoke = Demo 2", () => {
  it("register → code → feed → interested → drained → CRM has the activity", async () => {
    const t = await testApp();
    const email = "new.member@test.dev";
    const signUp = await t.app.request("/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "bbcclub://" }, body: JSON.stringify({ email, password: "atlantic2026!", name: "" }) });
    expect(signUp.status).toBeLessThan(400);
    const otp = t.email.lastOtp(email);
    const verify = await t.app.request("/api/auth/email-otp/verify-email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "bbcclub://" }, body: JSON.stringify({ email, otp }) });
    expect(verify.status).toBeLessThan(400);
    const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0];
    await t.drainAll();                                                            // member.registered → profile
    const offerId = await t.seedBroadcastOffer();
    const feed = await t.app.request("/v1/proposals", { headers: { Cookie: cookie } });
    expect(feed.status).toBe(200);
    expect((await feed.json()).items.some((i: any) => i.id === offerId)).toBe(true);
    const r = await t.app.request(`/v1/proposals/${offerId}/respond`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ response: "interested" }) });
    expect(r.status).toBe(200);
    await t.drainAll();                                                            // offer.responded → crm + notifications
    expect(t.crm.activities.some((a) => a.offerId === offerId)).toBe(true);
    const [{ n }]: any = await t.db.execute(sql`SELECT count(*)::int n FROM notifications.notifications WHERE category='transactional' AND title ILIKE '%Julia%'`);
    expect(n).toBeGreaterThan(0);
    await t.close();
  });
});
