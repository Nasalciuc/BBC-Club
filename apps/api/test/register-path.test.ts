import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

/** Expo default cookiePrefix looks for this name and ignores `bbc.session_token`. */
const EXPO_DEFAULT_SESSION = "better-auth.session_token";
const CLUB_SESSION = "bbc.session_token";

function cookiePair(setCookie: string, name: string): string | null {
  const escaped = name.replace(/\./g, "\\.");
  const match = setCookie.match(new RegExp(`(?:^|[,\\s])(${escaped}=[^;]+)`));
  return match?.[1] ?? null;
}

describe("registration path (ADR-PROD-001)", () => {
  it("email → OTP → session, then a profile exists and the journal has member.registered", async () => {
    const t = await testApp({ suite: "regpath" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    const email = `regpath.${crypto.randomUUID().slice(0, 8)}@test.dev`;
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

  it("OTP Set-Cookie is bbc.session_token; Expo default name is ignored → set-password 401", async () => {
    const t = await testApp({ suite: "regcookie" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    const email = `regcookie.${crypto.randomUUID().slice(0, 8)}@test.dev`;
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

    const setCookie = [verify.headers.getSetCookie?.() ?? [], verify.headers.get("set-cookie")]
      .flat()
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(", ");
    expect(setCookie).toContain(`${CLUB_SESSION}=`);
    expect(cookiePair(setCookie, EXPO_DEFAULT_SESSION)).toBeNull();

    const bbc = cookiePair(setCookie, CLUB_SESSION);
    expect(bbc).toBeTruthy();
    const token = bbc!.slice(`${CLUB_SESSION}=`.length);
    const body = JSON.stringify({ newPassword: "atlantic2026!" });

    const ignored = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: `${EXPO_DEFAULT_SESSION}=${token}`, "Content-Type": "application/json" },
      body,
    });
    expect(ignored.status).toBe(401);

    const ok = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: bbc!, "Content-Type": "application/json" },
      body,
    });
    expect(ok.status).toBe(200);
    await t.close();
  });

  it("sign-up/email is not served: no account oracle, no unsolicited code (Join is OTP-first)", async () => {
    const t = await testApp({ suite: "regsignup" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    const signUp = (email: string) =>
      t.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
        body: JSON.stringify({ email, password: "harness-pass-99", name: "" }),
      });
    const mailsBefore = t.email.sent.length;
    const existing = await signUp(t.memberA.email);
    const fresh = await signUp(`regsignup.${crypto.randomUUID().slice(0, 8)}@test.dev`);
    expect(existing.status).toBe(404);
    expect(fresh.status).toBe(404);
    expect(await existing.text()).toBe(await fresh.text());
    expect(t.email.sent.length).toBe(mailsBefore);
    await t.close();
  });

  it("an address registered unverified before sign-up/email was closed: its owner's Join lands signed in", async () => {
    const t = await testApp({ suite: "regprereg" });
    await t.db.execute(sql`DELETE FROM auth.rate_limit`);
    const email = `regprereg.${crypto.randomUUID().slice(0, 8)}@test.dev`;
    // What a stranger could do over HTTP until now: an unverified account with their password.
    await t.auth.createMember(email, "strangers-pass-2026", { verified: false });
    const send = await t.app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(send.status).toBe(200);
    const verify = await t.app.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
      body: JSON.stringify({ email, otp: t.email.lastOtp(email) }),
    });
    expect(verify.status).toBe(200);
    const cookie = verify.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .filter((c) => c.length > 0)
      .join("; ");
    // The cookie cache was written with the user as it was before the code verified it (emailVerified: false).
    const status = await t.app.request("/v1/account/password", { headers: { Cookie: cookie } });
    expect(status.status).toBe(200);
    // The stranger's password went with the verification: the owner sets their own.
    expect(await status.json()).toEqual({ hasPassword: false });
    await t.close();
  });
});
