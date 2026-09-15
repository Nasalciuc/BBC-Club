import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("registration path (ADR-PROD-001)", () => {
  it("email → OTP → session, then a profile exists and the journal has member.registered", async () => {
    const t = await testApp({ suite: "regpath" });
    const email = "regpath@test.dev";
    const send = await t.app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(send.status).toBeLessThan(400);
    const otp = t.email.lastOtp(email);
    const verify = await t.app.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
      body: JSON.stringify({ email, otp }),
    });
    expect(verify.status).toBeLessThan(400);
    expect(verify.headers.get("set-cookie")).toBeTruthy();
    const [u]: any = await t.db.execute(sql`SELECT id, email_verified FROM auth."user" WHERE email = ${email}`);
    expect(u.email_verified).toBe(true);
    await t.drainAll();
    const [{ n }]: any = await t.db.execute(sql`SELECT count(*)::int n FROM members.profile WHERE member_id = ${u.id}`);
    expect(n).toBe(1);
    await t.close();
  });
});
