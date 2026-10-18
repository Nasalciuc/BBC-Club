/** Password change + revokeOtherSessions, and a reset by email code: the other device is 401 after the cookie-cache
 *  TTL; the device that changed the password stays signed in (ADR-IMPL-047). */
import { describe, expect, it } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("session revocation (cookie cache)", () => {
  it("the other device is 401 after SESSION_COOKIE_CACHE_SECONDS=10", async () => {
    const t = await testApp({ suite: "session-revocation", env: { SESSION_COOKIE_CACHE_SECONDS: "10" } });
    const cookieA = t.memberA.cookie;
    const cookieB = await t.auth.cookieFor(t.memberA.email, t.memberA.password);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookieA } })).status).toBe(200);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookieB } })).status).toBe(200);
    const change = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: cookieB, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "newClubPass2026!", currentPassword: t.memberA.password }),
    });
    expect(change.status).toBe(200);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookieB } })).status).toBe(200);
    await Bun.sleep(11_000);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookieA } })).status).toBe(401);
    // The phone that changed it is still signed in past the cache (ADR-IMPL-047).
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookieB } })).status).toBe(200);
    const cookieFresh = await t.auth.cookieFor(t.memberA.email, "newClubPass2026!");
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookieFresh } })).status).toBe(200);
    await t.close();
  }, 30_000);

  it("a reset by email code signs out every session the account had (ADR-IMPL-047)", async () => {
    const t = await testApp({ suite: "session-revocation-reset", env: { SESSION_COOKIE_CACHE_SECONDS: "10" } });
    const elsewhere = t.memberA.cookie;
    expect((await t.app.request("/v1/profile", { headers: { Cookie: elsewhere } })).status).toBe(200);
    const auth = (path: string, body: Record<string, string>) =>
      t.app.request(`/api/auth${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: t.appOrigin },
        body: JSON.stringify(body),
      });
    expect(
      (await auth("/email-otp/send-verification-otp", { email: t.memberA.email, type: "forget-password" })).status,
    ).toBe(200);
    const otp = t.email.lastOtp(t.memberA.email);
    expect(otp).toBeTruthy();
    const reset = await auth("/email-otp/reset-password", {
      email: t.memberA.email,
      otp: otp!,
      password: "resetClubPass2026!",
    });
    expect(reset.status).toBe(200);
    await Bun.sleep(11_000);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: elsewhere } })).status).toBe(401);
    const fresh = await t.auth.cookieFor(t.memberA.email, "resetClubPass2026!");
    expect((await t.app.request("/v1/profile", { headers: { Cookie: fresh } })).status).toBe(200);
    await t.close();
  }, 30_000);
});
