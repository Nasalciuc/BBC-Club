import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createIdentityFacade } from "@bbc/identity";
import { testAuth } from "./helpers/test-auth"; // Better Auth against the test Postgres (docker compose `postgres-test`)

describe("requireMember — no dead guards", () => {
  let app: Hono<any>;
  let cookie: string;
  beforeAll(async () => {
    const { auth, signedInCookie } = await testAuth();
    cookie = await signedInCookie("guard@test.dev", "atlantic2026!");
    const identity = createIdentityFacade(auth);
    app = new Hono();
    app.get("/v1/me", identity.requireMember, (c) => c.json({ id: c.get("member").id }));
  });
  it("401 without a cookie", async () => expect((await app.request("/v1/me")).status).toBe(401));
  it("401 with garbage cookie", async () =>
    expect((await app.request("/v1/me", { headers: { Cookie: "bbc.session_token=nope" } })).status).toBe(401));
  it("200 with a verified session", async () =>
    expect((await app.request("/v1/me", { headers: { Cookie: cookie } })).status).toBe(200));
});

describe("route inventory — everything under /v1 is protected", () => {
  it("every /v1 route except the allow-list refuses anonymous requests", async () => {
    const { default: server } = await import("../../../../../apps/api/src/index");
    const allow = new Set(["/v1/app-config"]);
    const routes = (server as any).fetch ? (await import("../../../../../apps/api/src/index")).default : null;
    // Hono exposes app.routes; iterate and call each GET/POST/DELETE anonymously
    const appModule: any = await import("../../../../../apps/api/src/index");
    const hono: any = appModule.default?.app ?? appModule.app ?? appModule.default;
    for (const r of hono.routes.filter((x: any) => x.path.startsWith("/v1") && !allow.has(x.path))) {
      const res = await hono.request(r.path, { method: r.method });
      expect([401, 403, 404]).toContain(res.status); // never 200 anonymously
    }
  });
});
