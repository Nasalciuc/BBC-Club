import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { routeRegistry } from "../src/middleware/authorize";
import { testApp } from "./helpers/test-app"; // boots the host against postgres-test with two members (A, B), one operator JWT, the internal secret

describe("authorization gates", () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  beforeAll(async () => {
    t = await testApp({ suite: "authz" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("inventory: every /v1 route is registered with a permission or marked public", () => {
    for (const r of t.app.routes.filter((x: any) => x.path.startsWith("/v1") && x.method !== "ALL")) {
      expect(routeRegistry.has(`${r.method} ${r.path}`)).toBe(true);
    }
    expect(
      [...routeRegistry.entries()].filter(([k, p]) => p === "public" && k.startsWith("GET /v1")).map(([k]) => k),
    ).toEqual(["GET /v1/app-config", "GET /v1/test/last-otp"]);
  });

  it("IDOR: member A cannot see or act on member B's targeted offer (404, body identical to a missing id)", async () => {
    const offerForB = await t.seedTargetedOffer(t.memberB.id);
    const asA = await t.app.request(`/v1/proposals/${offerForB}`, { headers: { Cookie: t.memberA.cookie } });
    const missing = await t.app.request(`/v1/proposals/00000000-0000-4000-8000-000000000000`, {
      headers: { Cookie: t.memberA.cookie },
    });
    expect(asA.status).toBe(404);
    expect(await asA.text()).toBe(await missing.text());
    const respondAsA = await t.app.request(`/v1/proposals/${offerForB}/respond`, {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ response: "interested" }),
    });
    expect(respondAsA.status).toBe(404);
    expect(await t.countResponses(offerForB)).toBe(0);
  });

  it("memberId in the body is ignored: A responding 'as B' records A", async () => {
    const broadcast = await t.seedBroadcastOffer();
    await t.app.request(`/v1/proposals/${broadcast}/respond`, {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ response: "interested", memberId: t.memberB.id }),
    });
    expect(await t.responseOwner(broadcast)).toBe(t.memberA.id);
  });

  it("mark-read on someone else's notification → 404 and no change", async () => {
    const nB = await t.seedNotification(t.memberB.id);
    const r = await t.app.request(`/v1/inbox/${nB}/read`, { method: "POST", headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(404);
    expect(await t.isRead(nB)).toBe(false);
  });

  it("privilege escalation: member cookie on internal route → 403; operator JWT on internal route → 403; wrong secret → 401", async () => {
    expect(
      (await t.app.request("/v1/internal/offers", { method: "POST", headers: { Cookie: t.memberA.cookie } })).status,
    ).toBe(403);
    expect(
      (
        await t.app.request("/v1/internal/offers", {
          method: "POST",
          headers: { Authorization: `Bearer ${t.operatorJwt}` },
        })
      ).status,
    ).toBe(403);
    expect(
      (await t.app.request("/v1/internal/offers", { method: "POST", headers: { "X-Internal-Secret": "nope" } })).status,
    ).toBe(401);
  });

  it("internal secret cannot be used outside /v1/internal", async () => {
    expect((await t.app.request("/v1/proposals", { headers: { "X-Internal-Secret": t.internalSecret } })).status).toBe(
      403,
    );
  });

  it("killswitch: engagement disabled → 503 SERVICE_DISABLED, feed still 200", async () => {
    await t.flags.kill("engagement");
    const broadcast = await t.seedBroadcastOffer();
    expect(
      (
        await t.app.request(`/v1/proposals/${broadcast}/respond`, {
          method: "POST",
          headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ response: "interested" }),
        })
      ).status,
    ).toBe(503);
    expect((await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } })).status).toBe(200);
    await t.flags.revive("engagement");
  });

  it("handler acting for member A cannot mark B's response as synced", async () => {
    const broadcast = await t.seedBroadcastOffer();
    await t.respondAs(t.memberB, broadcast, "interested");
    await expect(
      t.runHandler("crm.onOfferResponded", {
        type: "offer.responded",
        version: 1,
        offerId: broadcast,
        memberId: t.memberA.id,
        response: "interested",
        at: new Date().toISOString(),
      }),
    ).rejects.toThrow(/affected 0 rows/);
  });
});
