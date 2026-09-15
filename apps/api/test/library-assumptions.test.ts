import { describe, it, expect, beforeAll } from "bun:test";
import { decodeJwt } from "jose";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

/** P1: jwtVerify in principal.ts requires iss+aud = APP_ORIGIN. If the jwt plugin omits them, every operator JWT is 401. */
describe("JWT claims (Better Auth jwt plugin)", () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  beforeAll(async () => {
    t = await testApp();
  });

  it("getToken emits iss and aud equal to APP_ORIGIN; resolvePrincipal accepts the bearer", async () => {
    const claims = decodeJwt(t.operatorJwt);
    expect(claims.iss).toBe(t.appOrigin);
    expect(claims.aud).toBe(t.appOrigin);
    // 403 (not 401): principal resolved as operator, permission denied on internal route
    const r = await t.app.request("/v1/internal/offers", {
      method: "POST",
      headers: { Authorization: `Bearer ${t.operatorJwt}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(403);
  });

  it("GET /api/auth/jwks returns a key set", async () => {
    const r = await t.app.request("/api/auth/jwks");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { keys?: unknown[] };
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys!.length).toBeGreaterThan(0);
  });
});

describe("Better Auth rate-limit customRules", () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  beforeAll(async () => {
    t = await testApp();
  });

  it("6th POST /api/auth/sign-in/email is 429 with retry-after header", async () => {
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 6; i++) {
      const r = await t.app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "rate-limit-probe@test.dev", password: "wrong-password-xx" }),
      });
      statuses.push(r.status);
      if (r.status === 429) {
        // Better Auth 1.6.31 emits X-Retry-After (not the standard Retry-After).
        retryAfter = r.headers.get("Retry-After") ?? r.headers.get("X-Retry-After");
      }
    }
    expect(statuses[5]).toBe(429);
    expect(retryAfter).toBeTruthy();
  });

  it("4th POST /api/auth/email-otp/send-verification-otp is 429", async () => {
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await t.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "otp-rate@test.dev", type: "sign-in" }),
      });
      statuses.push(r.status);
    }
    expect(statuses[3]).toBe(429);
  });
});
