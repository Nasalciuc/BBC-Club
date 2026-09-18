import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { routeRegistry } from "../src/middleware/authorize";
import { assertPublicGetV1Policy, publicGetV1Keys } from "./helpers/route-inventory";
import { testApp } from "./helpers/test-app";

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
    const publicKeys = publicGetV1Keys();
    expect(publicKeys.length).toBeGreaterThan(0);
    expect(() => assertPublicGetV1Policy(publicKeys)).not.toThrow();
    const mountedGetV1 = new Set(
      t.app.routes.filter((x: any) => x.method === "GET" && x.path.startsWith("/v1")).map((x: any) => `GET ${x.path}`),
    );
    for (const key of publicKeys) {
      expect(mountedGetV1.has(key)).toBe(true);
    }
  });

  it("IDOR: member A cannot see member B's targeted offer (404, body identical to a missing id)", async () => {
    const offerForB = await t.seedTargetedOffer(t.memberB.id);
    const asA = await t.app.request(`/v1/proposals/${offerForB}`, { headers: { Cookie: t.memberA.cookie } });
    const missing = await t.app.request(`/v1/proposals/00000000-0000-4000-8000-000000000000`, {
      headers: { Cookie: t.memberA.cookie },
    });
    expect(asA.status).toBe(404);
    expect(await asA.text()).toBe(await missing.text());
  });

  it("IDOR: member A cannot GET member B's request (404)", async () => {
    const created = await t.submitRequestAs(
      t.memberB,
      t.sampleRequestBody({ contact: { name: "Bob", phone: "+12125550199", email: "bob@test.dev" } }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string };
    const asA = await t.app.request(`/v1/requests/${body.id}`, { headers: { Cookie: t.memberA.cookie } });
    expect(asA.status).toBe(404);
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

  it("killswitch: requests disabled → 503 SERVICE_DISABLED, feed still 200", async () => {
    await t.flags.kill("requests");
    expect((await t.submitRequestAs(t.memberA, t.sampleRequestBody())).status).toBe(503);
    expect((await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } })).status).toBe(200);
    await t.flags.revive("requests");
  });

  it("respond route is gone (404)", async () => {
    const broadcast = await t.seedBroadcastOffer();
    expect(
      (
        await t.app.request(`/v1/proposals/${broadcast}/respond`, {
          method: "POST",
          headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ response: "interested" }),
        })
      ).status,
    ).toBe(404);
  });
});
