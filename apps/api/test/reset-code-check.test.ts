/** Forgot password checks the code on Verify before asking for the new password (apps/mobile verify-code.tsx,
 *  flows.ts checkResetCode). The app relies on better-auth 1.6.31's check: a wrong code is INVALID_OTP, a right one is
 *  not used up by the check — the reset consumes it. */
import { describe, expect, it } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("reset code checked on Verify (/email-otp/check-verification-otp)", () => {
  it("a wrong code is INVALID_OTP; a right one passes, twice, then resets the password and is spent", async () => {
    const t = await testApp({ suite: "reset-code-check" });
    try {
      const auth = (path: string, body: Record<string, string>) =>
        t.app.request(`/api/auth${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: t.appOrigin },
          body: JSON.stringify(body),
        });
      const email = t.memberA.email;
      expect((await auth("/email-otp/send-verification-otp", { email, type: "forget-password" })).status).toBe(200);
      const otp = t.email.lastOtp(email);
      expect(otp).toBeTruthy();
      const wrong = otp === "000000" ? "111111" : "000000";

      const check = (code: string) =>
        auth("/email-otp/check-verification-otp", { email, type: "forget-password", otp: code });
      const refused = await check(wrong);
      expect(refused.status).toBe(400);
      expect(((await refused.json()) as { code?: string }).code).toBe("INVALID_OTP");

      // The check does not consume a right code: Verify checks it, set-password's reset uses it.
      expect((await check(otp!)).status).toBe(200);
      expect((await check(otp!)).status).toBe(200);

      const reset = await auth("/email-otp/reset-password", { email, otp: otp!, password: "resetCheckPass2026!" });
      expect(reset.status).toBe(200);

      // Spent by the reset.
      const after = await check(otp!);
      expect(after.status).toBe(400);
      expect(((await after.json()) as { code?: string }).code).toBe("INVALID_OTP");
      const fresh = await t.auth.cookieFor(email, "resetCheckPass2026!");
      expect((await t.app.request("/v1/profile", { headers: { Cookie: fresh } })).status).toBe(200);
    } finally {
      await t.close();
    }
  }, 30_000);
});
