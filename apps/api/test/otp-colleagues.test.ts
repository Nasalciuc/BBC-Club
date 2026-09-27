import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("OTP colleagues + per-email cooldown", () => {
  it("ten different emails from one IP all get a code; the 11th is 429; cooldown skips a second mail", async () => {
    const t = await testApp({ suite: "otp-colleagues" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    await t.db.execute(sql`DELETE FROM auth.otp_cooldown`);

    const send = (email: string, ip = "203.0.113.50") =>
      t.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `${ip}, 173.245.48.1`,
          Origin: t.appOrigin,
        },
        body: JSON.stringify({ email, type: "sign-in" }),
      });

    const emails = Array.from({ length: 10 }, (_, i) => `colleague.${i}.otp-colleagues@test.dev`);
    for (const email of emails) {
      expect((await send(email)).status).toBe(200);
      expect(t.email.lastOtp(email)).toBeTruthy();
    }
    expect((await send("colleague.over@test.dev")).status).toBe(429);

    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    const twice = "same.otp-colleagues@test.dev";
    expect((await send(twice)).status).toBe(200);
    const first = t.email.lastOtp(twice);
    const before = t.email.sent.length;
    expect((await send(twice)).status).toBe(200);
    expect(t.email.sent.length).toBe(before); // cooldown: no second Postmark call
    expect(t.email.lastOtp(twice)).toBe(first);

    const keys = (await t.db.execute(sql`SELECT key FROM auth.otp_cooldown`)) as { key: string }[];
    expect(keys.every((r) => !r.key.includes("@"))).toBe(true);

    await t.close();
  });

  it("failed send releases the claim so a retry inside 30s can mail", async () => {
    const t = await testApp({ suite: "otp-fail-retry" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    await t.db.execute(sql`DELETE FROM auth.otp_cooldown`);

    const email = "fail.retry.otp@test.dev";
    const send = () =>
      t.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.60, 173.245.48.1",
          Origin: t.appOrigin,
        },
        body: JSON.stringify({ email, type: "sign-in" }),
      });

    t.email.failNext(1);
    // Better Auth 1.6.31 runInBackgroundOrAwait swallows send errors → still HTTP 200.
    expect((await send()).status).toBe(200);
    expect(t.email.sent.filter((s) => s.to.toLowerCase() === email).length).toBe(0);

    expect((await send()).status).toBe(200);
    expect(t.email.lastOtp(email)).toBeTruthy();

    await t.close();
  });

  it("after five bad verifies, resend inside 30s still delivers the replacement OTP", async () => {
    const t = await testApp({ suite: "otp-replace" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    await t.db.execute(sql`DELETE FROM auth.otp_cooldown`);

    const email = t.memberA.email;
    const send = () =>
      t.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.70, 173.245.48.1",
          Origin: t.appOrigin,
        },
        body: JSON.stringify({ email, type: "sign-in" }),
      });

    expect((await send()).status).toBe(200);
    const first = t.email.lastOtp(email);
    const before = t.email.sent.length;

    for (let i = 0; i < 5; i++) {
      const r = await t.app.request("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: t.appOrigin },
        body: JSON.stringify({ email, otp: "000000" }),
      });
      expect(r.status).toBeGreaterThanOrEqual(400);
    }

    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    expect((await send()).status).toBe(200);
    expect(t.email.sent.length).toBe(before + 1);
    const replacement = t.email.lastOtp(email);
    expect(replacement).not.toBe(first);

    await t.close();
  });

  it("verification is encrypted and cooldown otp_hash is not unkeyed sha256(otp)", async () => {
    const t = await testApp({ suite: "otp-storage" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    await t.db.execute(sql`DELETE FROM auth.otp_cooldown`);
    await t.db.execute(sql`DELETE FROM auth.verification`);

    const email = "storage.otp@test.dev";
    expect(
      (
        await t.app.request("/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "203.0.113.80, 173.245.48.1",
            Origin: t.appOrigin,
          },
          body: JSON.stringify({ email, type: "sign-in" }),
        })
      ).status,
    ).toBe(200);
    const otp = t.email.lastOtp(email);

    const verif = (await t.db.execute(sql`
      SELECT value FROM auth.verification
      WHERE identifier = ${`sign-in-otp-${email}`}
      ORDER BY created_at DESC LIMIT 1`)) as { value: string }[];
    expect(verif.length).toBe(1);
    const value = verif[0]?.value ?? "";
    expect(value).not.toMatch(/^\d{6}:/);

    const cool = (await t.db.execute(sql`SELECT otp_hash FROM auth.otp_cooldown`)) as {
      otp_hash: string | null;
    }[];
    expect(cool.length).toBe(1);
    const stored = cool[0]?.otp_hash;
    expect(stored).toBeTruthy();
    const unkeyed = createHash("sha256").update(otp).digest("hex");
    expect(stored).not.toBe(unkeyed);

    await t.close();
  });
});
