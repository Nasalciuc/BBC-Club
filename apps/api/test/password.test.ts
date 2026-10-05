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
});
