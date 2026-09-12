import { describe, it, expect, beforeAll } from "bun:test";
import { testAuth } from "./helpers/test-auth";

describe("register → code → verified session → member.registered", () => {
  let ctx: Awaited<ReturnType<typeof testAuth>>;
  beforeAll(async () => { ctx = await testAuth(); });

  it("completes the flow and publishes exactly one event", async () => {
    const email = `alex+${Date.now()}@test.dev`;
    await ctx.auth.api.signUpEmail({ body: { email, password: "atlantic2026!", name: "" } });
    const otp = ctx.mailbox.lastOtp(email);                           // fake EmailSender captures it
    expect(otp).toMatch(/^\d{6}$/);
    const res = await ctx.auth.api.verifyEmailOTP({ body: { email, otp } });
    expect(res.status).toBe(true);
    const events = await ctx.journal.byType("member.registered");
    expect(events.filter((e) => e.payload.emailNormalized === email).length).toBe(1);
  });

  it("rejects a reused code and locks after 5 wrong attempts", async () => {
    const email = `bob+${Date.now()}@test.dev`;
    await ctx.auth.api.signUpEmail({ body: { email, password: "atlantic2026!", name: "" } });
    for (let i = 0; i < 5; i++) {
      await expect(ctx.auth.api.verifyEmailOTP({ body: { email, otp: "000000" } })).rejects.toBeTruthy();
    }
    await expect(ctx.auth.api.verifyEmailOTP({ body: { email, otp: ctx.mailbox.lastOtp(email) } })).rejects.toMatchObject({ body: { code: "TOO_MANY_ATTEMPTS" } });
  });
});
