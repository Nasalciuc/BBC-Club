import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testAuth } from "./helpers/test-auth";

describe("breached passwords are refused in the club's voice", () => {
  it("rejects password123", async () => {
    const ctx = await testAuth({ hibp: (p) => p === "password123" });
    try {
      await expect(
        ctx.auth.api.signUpEmail({ body: { email: `p+${Date.now()}@test.dev`, password: "password123", name: "" } }),
      ).rejects.toMatchObject({ body: { message: expect.stringContaining("data breach") } });
    } finally {
      await ctx.close();
    }
  });
});

/** A member with a password asks for a reset code; returns what the member would type. */
async function resetCodeFor(ctx: Awaited<ReturnType<typeof testAuth>>, email: string) {
  await ctx.auth.api.signUpEmail({ body: { email, password: "first-pass-2026!", name: "" } });
  await ctx.db.execute(sql`UPDATE auth."user" SET email_verified = true WHERE email = ${email}`);
  await ctx.auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
  return ctx.mailbox.lastOtp(email);
}

describe("reset by code: a refused password leaves the code usable", () => {
  it("a breached password is refused before the code is used; the same code then takes a good one", async () => {
    const ctx = await testAuth({ hibp: (p) => p === "password123456" });
    try {
      const email = `reset-breached.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      const otp = await resetCodeFor(ctx, email);
      await expect(
        ctx.auth.api.resetPasswordEmailOTP({ body: { email, otp, password: "password123456" } }),
      ).rejects.toMatchObject({
        statusCode: 400,
        body: { code: "PASSWORD_COMPROMISED", message: expect.stringContaining("data breach") },
      });
      expect(await ctx.auth.api.resetPasswordEmailOTP({ body: { email, otp, password: "good-pass-2026!" } })).toEqual({
        success: true,
      });
      const signIn = await ctx.auth.api.signInEmail({ body: { email, password: "good-pass-2026!" }, asResponse: true });
      expect(signIn.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  it("letters only are refused (one number or symbol), before the code is used", async () => {
    const ctx = await testAuth();
    try {
      const email = `reset-weak.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      const otp = await resetCodeFor(ctx, email);
      await expect(
        ctx.auth.api.resetPasswordEmailOTP({ body: { email, otp, password: "bbbbbbbb" } }),
      ).rejects.toMatchObject({
        statusCode: 400,
        body: { code: "PASSWORD_TOO_WEAK", message: "Use at least one number or symbol." },
      });
      expect(await ctx.auth.api.resetPasswordEmailOTP({ body: { email, otp, password: "bbbbbbb1" } })).toEqual({
        success: true,
      });
      const signIn = await ctx.auth.api.signInEmail({ body: { email, password: "bbbbbbb1" }, asResponse: true });
      expect(signIn.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  it("a list that cannot be read refuses the password and keeps the code", async () => {
    const ctx = await testAuth({
      hibp: (p) => {
        if (p === "unchecked-pass-2026x") throw new Error("api.pwnedpasswords.com unreachable");
        return false;
      },
    });
    try {
      const email = `reset-down.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      const otp = await resetCodeFor(ctx, email);
      await expect(
        ctx.auth.api.resetPasswordEmailOTP({ body: { email, otp, password: "unchecked-pass-2026x" } }),
      ).rejects.toMatchObject({ statusCode: 503, body: { code: "PASSWORD_CHECK_UNAVAILABLE" } });
      expect(await ctx.auth.api.resetPasswordEmailOTP({ body: { email, otp, password: "good-pass-2026!" } })).toEqual({
        success: true,
      });
    } finally {
      await ctx.close();
    }
  });
});
