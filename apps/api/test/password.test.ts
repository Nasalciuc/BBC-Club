/** POST /v1/account/password: set a new password, publishes member.password_changed. */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("POST /v1/account/password", () => {
  it("accepts a valid new password and publishes member.password_changed", async () => {
    const t = await testApp({ suite: "pw-change" });
    const r = await t.app.request("/v1/account/password", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "newClubPass2026!" }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(true);
    await t.drainAll();
    const evts = await t.journal.forMember(t.memberA.id);
    const changed = evts.filter((e: any) => e.payload.type === "member.password_changed");
    expect(changed.length).toBeGreaterThanOrEqual(1);
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
