/** Password change + revokeOtherSessions: the other device is 401 after the cookie-cache TTL. */
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
    const cookieFresh = await t.auth.cookieFor(t.memberA.email, "newClubPass2026!");
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookieFresh } })).status).toBe(200);
    await t.close();
  }, 30_000);
});
