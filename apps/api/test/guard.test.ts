import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { testApp } from "./helpers/test-app";

describe("requireMember — no dead guards", () => {
  it("401 without a cookie, 401 with a garbage cookie, 200 with a verified session", async () => {
    const t = await testApp({ suite: "guard" });
    const identity = t.registry.facade<any>("identity");
    const app = new Hono<any>();
    app.get("/v1/me", identity.requireMember, (c: any) => c.json({ id: c.get("member").id }));

    expect((await app.request("/v1/me")).status).toBe(401);
    expect((await app.request("/v1/me", { headers: { Cookie: "bbc.session_token=nope" } })).status).toBe(401);
    const ok = await app.request("/v1/me", { headers: { Cookie: t.memberA.cookie } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: t.memberA.id });
    await t.close();
  });
});

describe("route inventory — everything under /v1 is protected", () => {
  it("every /v1 route except the allow-list refuses anonymous requests", async () => {
    const t = await testApp({ suite: "guard" });
    const allow = new Set(["/v1/app-config", "/v1/test/last-otp"]);
    const routes = (t.app as any).routes as { path: string; method: string }[];
    const guarded = routes.filter((x) => x.path.startsWith("/v1") && !allow.has(x.path));
    expect(guarded.length).toBeGreaterThan(0); // an empty inventory would pass vacuously
    for (const r of guarded) {
      const res = await t.app.request(r.path, { method: r.method });
      expect([401, 403, 404]).toContain(res.status); // never 200 anonymously
    }
    await t.close();
  });
});
