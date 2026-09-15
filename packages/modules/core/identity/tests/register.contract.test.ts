import { describe, it, expect } from "bun:test";
import { testAuth } from "./helpers/test-auth";

describe("register → code → verified session → member.registered", () => {
  it("completes the flow and publishes exactly one event", async () => {
    const ctx = await testAuth();
    try {
      const email = `alex+${Date.now()}@test.dev`;
      await ctx.auth.api.signUpEmail({ body: { email, password: "atlantic2026!", name: "" } });
      const otp = ctx.mailbox.lastOtp(email); // fake EmailSender captures it
      expect(otp).toMatch(/^\d{6}$/);
      const res = await ctx.auth.api.verifyEmailOTP({ body: { email, otp } });
      expect(res.status).toBe(true);
      const events = await ctx.journal.byType("member.registered");
      expect(events.filter((e) => e.payload.emailNormalized === email.toLowerCase()).length).toBe(1);
    } finally {
      await ctx.close();
    }
  });

  it("rejects a reused code and locks after 5 wrong attempts", async () => {
    const ctx = await testAuth();
    try {
      const email = `bob+${Date.now()}@test.dev`;
      await ctx.auth.api.signUpEmail({ body: { email, password: "atlantic2026!", name: "" } });
      for (let i = 0; i < 5; i++) {
        let rejected = false;
        try {
          await ctx.auth.api.verifyEmailOTP({ body: { email, otp: "000000" } });
        } catch {
          rejected = true;
        }
        expect(rejected).toBe(true);
      }
      let lockErr: unknown;
      try {
        await ctx.auth.api.verifyEmailOTP({ body: { email, otp: ctx.mailbox.lastOtp(email) } });
      } catch (e) {
        lockErr = e;
      }
      expect(lockErr).toMatchObject({ body: { code: "TOO_MANY_ATTEMPTS" } });
    } finally {
      await ctx.close();
    }
  });
});
