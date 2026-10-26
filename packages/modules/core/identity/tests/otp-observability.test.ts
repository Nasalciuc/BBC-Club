import { describe, it, expect } from "bun:test";
import { testAuth } from "./helpers/test-auth";

/** A code that could not be mailed leaves one structured error line, a counter and (once per window) an ops post —
 *  never the address, never the code. Successful sends are counted too, so the failure ratio can be read. */
describe("OTP send failures are logged, counted and alerted", () => {
  it("a failed send: one 'otp send failed' line without the address, otp_send_failed counted, one ops post", async () => {
    const ctx = await testAuth();
    try {
      const email = `observe.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      ctx.mailbox.failNext(2, new Error(`Postmark 503: {"ErrorCode":0,"Message":"outage for ${email}"}`));
      await expect(ctx.auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } })).rejects.toMatchObject({
        statusCode: 503,
        body: { code: "EMAIL_UNDELIVERABLE", reason: "provider_error" },
      });

      const failed = ctx.seen.logs.filter((l) => l.message === "otp send failed");
      expect(failed.length).toBe(1);
      expect(failed[0]?.level).toBe("error");
      expect(failed[0]?.fields).toMatchObject({ purpose: "sign-in", reason: "provider_error", status: 503 });
      expect(JSON.stringify(failed[0]?.fields)).not.toContain("@");
      // Nothing the process logs about the failure carries the address (the provider's message may name it).
      expect(JSON.stringify(ctx.seen.logs)).not.toContain(email);
      expect(ctx.seen.counted).toContainEqual({
        name: "otp_send_failed",
        labels: { purpose: "sign-in", reason: "provider_error" },
      });
      expect(ctx.seen.counted.some((c) => c.name === "otp_sent")).toBe(false);
      expect(ctx.seen.posted.length).toBe(1);
      expect(ctx.seen.posted[0]).toContain("otp send failed");
      expect(ctx.seen.posted[0]).not.toContain("@");

      // A second failure inside the alert window is logged and counted, not posted again.
      await expect(ctx.auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } })).rejects.toMatchObject({
        statusCode: 503,
      });
      expect(ctx.seen.logs.filter((l) => l.message === "otp send failed").length).toBe(2);
      expect(ctx.seen.posted.length).toBe(1);

      // The send that works is counted as sent.
      expect(await ctx.auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } })).toEqual({ success: true });
      expect(ctx.seen.counted).toContainEqual({ name: "otp_sent", labels: { purpose: "sign-in" } });
    } finally {
      await ctx.close();
    }
  });

  it("a reset code that could not be mailed keeps its 200 but is logged and counted", async () => {
    const ctx = await testAuth();
    try {
      const email = `observe-reset.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      await ctx.auth.api.signUpEmail({ body: { email, password: "first-pass-2026!", name: "" } });
      ctx.mailbox.failNext(1, Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }));
      expect(await ctx.auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } })).toEqual({
        success: true,
      });
      expect(ctx.seen.logs.filter((l) => l.message === "otp send failed")[0]?.fields).toMatchObject({
        purpose: "forget-password",
        reason: "timeout",
      });
      expect(ctx.seen.counted).toContainEqual({
        name: "otp_send_failed",
        labels: { purpose: "forget-password", reason: "timeout" },
      });
    } finally {
      await ctx.close();
    }
  });
});
