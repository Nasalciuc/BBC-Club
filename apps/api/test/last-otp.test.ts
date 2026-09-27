/** Coverage for GET /v1/test/last-otp (registered path literal for inventory). */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("GET /v1/test/last-otp", () => {
  it("is not registered in production", async () => {
    const t = await testApp({
      suite: "last-otp-prod",
      env: {
        NODE_ENV: "production",
        POSTMARK_SERVER_TOKEN: "x".repeat(10),
        PUSH_ADAPTER: "live",
        APNS_KEY_ID: "KEY",
        APNS_TEAM_ID: "TEAM",
        APNS_BUNDLE_ID: "com.buybusinessclass.club",
        APNS_P8_BASE64: "eA==",
        FCM_SERVICE_ACCOUNT_BASE64: "e30=",
      },
    });
    const r = await t.app.request("/v1/test/last-otp?email=alex@test.dev");
    expect(r.status).toBe(404);
    await t.close();
  });

  it("returns the captured OTP in non-production after send", async () => {
    const t = await testApp({ suite: "last-otp-dev" });
    const email = `otp.${crypto.randomUUID().slice(0, 8)}@test.dev`;
    const send = await t.app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(send.status).toBe(200);
    const expected = t.email.lastOtp(email);

    const r = await t.app.request(`/v1/test/last-otp?email=${encodeURIComponent(email)}`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { otp: string };
    expect(body.otp).toBe(expected);
    await t.close();
  });
});
