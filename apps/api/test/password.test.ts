/** POST /v1/account/password: set (Path A) or change (credential) a password. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("POST /v1/account/password", () => {
  it("Path A: first-time set without currentPassword is 200 and publishes member.password_changed", async () => {
    const t = await testApp({ suite: "pw-change" });
    await t.withPathAPassword(t.memberA.id);
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "newClubPass2026!" }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
    await t.drainAll();
    const evts = await t.journal.forMember(t.memberA.id);
    const changed = evts.filter((e: { payload?: { type?: string } }) => e.payload?.type === "member.password_changed");
    expect(changed.length).toBeGreaterThanOrEqual(1);
    await t.close();
  });

  it("credential + only newPassword is 409: the password is already set", async () => {
    const t = await testApp({ suite: "pw-has-cred" });
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "newClubPass2026!" }),
    });
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe("CONFLICT");
    expect(body.error?.message).toBe("This account already has a password.");
    await t.close();
  });

  it("a credential row with no stored password is not a password: setting one is 200", async () => {
    const t = await testApp({ suite: "pw-empty-cred" });
    await t.withEmptyCredential(t.memberA.id);
    const status = async () =>
      (await t.app.request("/v1/account/password", { headers: { Cookie: t.memberA.cookie } })).json();
    expect(await status()).toEqual({ hasPassword: false });
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "newClubPass2026!" }),
    });
    expect(r.status).toBe(200);
    expect(await status()).toEqual({ hasPassword: true });
    await t.close();
  });

  it("GET reports a stored password, and needs a session", async () => {
    const t = await testApp({ suite: "pw-status" });
    const r = await t.app.request("/v1/account/password", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hasPassword: true });
    expect((await t.app.request("/v1/account/password")).status).toBe(401);
    await t.close();
  });

  it("wrong current password is 400", async () => {
    const t = await testApp({ suite: "pw-wrong" });
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "newClubPass2026!", currentPassword: "not-the-password" }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: { message?: string } };
    expect(body.error?.message).toBe("That password isn't right.");
    await t.close();
  });

  it("right current password is 200 and revokes other sessions", async () => {
    const t = await testApp({ suite: "pw-right" });
    const cookieNow = await t.auth.cookieFor(t.memberA.email, t.memberA.password);
    const before = (await t.db.execute(
      sql`SELECT id FROM auth.session WHERE user_id = ${t.memberA.id}`,
    )) as unknown as unknown[];
    expect(before.length).toBeGreaterThanOrEqual(2);
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: cookieNow, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "newClubPass2026!", currentPassword: t.memberA.password }),
    });
    expect(r.status).toBe(200);
    const after = (await t.db.execute(
      sql`SELECT id FROM auth.session WHERE user_id = ${t.memberA.id}`,
    )) as unknown as unknown[];
    expect(after.length).toBe(1);
    const still = await t.app.request("/v1/profile", { headers: { Cookie: cookieNow } });
    expect(still.status).toBe(200);
    await t.close();
  });

  it("rejects a password that is too short", async () => {
    const t = await testApp({ suite: "pw-short" });
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "abc" }),
    });
    expect(r.status).toBe(400);
    await t.close();
  });

  it("401 without session", async () => {
    const t = await testApp({ suite: "pw-unauth" });
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "somepassword123!" }),
    });
    expect(r.status).toBe(401);
    await t.close();
  });

  it("the current password cannot be guessed without end: past the burst, 429 (ADR-IMPL-047)", async () => {
    const t = await testApp({ suite: "pw-guess" });
    const guess = () =>
      t.app.request("/v1/account/password", {
        method: "POST",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: "newClubPass2026!", currentPassword: "notTheOne2026!" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await guess()).status);
    // profile.write: a burst of 10, then one every two minutes — the wrong guesses are 400 until the limit says 429.
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // A bucket of its own: the guesses leave the member's profile edits as they were.
    const edit = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Alex Still Here" }),
    });
    expect(edit.status).toBe(200);
    await t.close();
  });

  it("nor around it: Better Auth's own change-password and verify-password are not served (ADR-IMPL-047)", async () => {
    const t = await testApp({ suite: "pw-auth-route" });
    const post = (path: string, body: Record<string, string>) =>
      t.app.request(`/api/auth${path}`, {
        method: "POST",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json", Origin: t.appOrigin },
        body: JSON.stringify(body),
      });
    // The right password on both: served, either would answer 200.
    const change = await post("/change-password", {
      newPassword: "newClubPass2026!",
      currentPassword: t.memberA.password,
    });
    expect(change.status).toBe(404);
    expect((await post("/verify-password", { password: t.memberA.password })).status).toBe(404);
    // Nothing changed: the password the member had still signs in.
    expect(await t.auth.cookieFor(t.memberA.email, t.memberA.password)).toBeTruthy();
    await t.close();
  });
});
