import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("OTP rate buckets behind Cloudflare", () => {
  it("two clients behind the same Cloudflare edge get independent buckets", async () => {
    const t = await testApp({ suite: "otp-buckets" });
    const a = await t.auth.createMember("a.otp-buckets@example.com");
    const b = await t.auth.createMember("b.otp-buckets@example.com");

    const send = (ip: string, email: string) =>
      t.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `${ip}, 173.245.48.1`,
          Origin: t.appOrigin,
        },
        body: JSON.stringify({ email, type: "email-verification" }),
      });

    expect((await send("203.0.113.9", a.email)).status).toBe(200);
    expect((await send("198.51.100.7", b.email)).status).toBe(200);
    await t.close();
  });
});
