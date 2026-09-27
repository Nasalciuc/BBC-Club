import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { decodeJwt } from "jose";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

/** P1: jwtVerify in principal.ts requires iss+aud = APP_ORIGIN. If the jwt plugin omits them, every operator JWT is 401. */
describe("JWT claims (Better Auth jwt plugin)", () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  beforeAll(async () => {
    t = await testApp({ suite: "library" });
  });
  afterAll(async () => {
    await t.close();
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

  it("GET /api/auth/get-session does not set a JWT header for a member", async () => {
    const r = await t.app.request("/api/auth/get-session", {
      headers: { cookie: t.memberA.cookie },
    });
    expect(r.status).toBe(200);
    const jwtHeader = [...r.headers.keys()].find((n) => n.toLowerCase() === "set-auth-jwt");
    expect(jwtHeader).toBeUndefined();
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
    t = await testApp({ suite: "library" });
  });
  afterAll(async () => {
    await t.close();
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

  it("11th POST /api/auth/email-otp/send-verification-otp is 429", async () => {
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    await t.db.execute(sql`DELETE FROM auth.otp_cooldown`);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await t.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `otp-rate-${i}@test.dev`, type: "sign-in" }),
      });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("resendStrategy reuse: second send after clearing rate_limit returns the same OTP", async () => {
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    await t.db.execute(sql`DELETE FROM auth.otp_cooldown`);
    const email = `otp.reuse.${crypto.randomUUID().slice(0, 8)}@test.dev`;
    const send = async () =>
      t.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
        body: JSON.stringify({ email, type: "sign-in" }),
      });
    expect((await send()).status).toBe(200);
    const first = t.email.lastOtp(email);
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    await t.db.execute(sql`DELETE FROM auth.otp_cooldown`);
    expect((await send()).status).toBe(200);
    expect(t.email.lastOtp(email)).toBe(first);
    const verify = await t.app.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
      body: JSON.stringify({ email, otp: first }),
    });
    expect(verify.status).toBeLessThan(400);
  });
});
