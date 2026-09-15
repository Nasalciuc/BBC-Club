/** PATCH /v1/profile + PUT /v1/profile/preferences: member-scoped update. */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("PATCH /v1/profile", () => {
  it("updates the caller's profile and publishes member.profile_updated", async () => {
    const t = await testApp({ suite: "profile-patch" });
    const r = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Alex Patched", homeAirport: "JFK" }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.displayName).toBe("Alex Patched");
    expect(body.homeAirport).toBe("JFK");
    await t.drainAll();
    const evts = await t.journal.forMember(t.memberA.id);
    const updated = evts.filter((e: any) => e.payload.type === "member.profile_updated");
    expect(updated.length).toBeGreaterThanOrEqual(1);
    await t.close();
  });

  it("member A cannot patch member B's profile (each sees own data)", async () => {
    const t = await testApp({ suite: "profile-idor" });
    // Member A patches → only A is affected
    await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "A Name" }),
    });
    const bProfile = await t.app.request("/v1/profile", { headers: { Cookie: t.memberB.cookie } });
    const bBody = (await bProfile.json()) as any;
    expect(bBody.displayName).not.toBe("A Name");
    await t.close();
  });

  it("400 when no fields provided", async () => {
    const t = await testApp({ suite: "profile-empty" });
    const r = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
    await t.close();
  });

  it("401 without session", async () => {
    const t = await testApp({ suite: "profile-unauth" });
    const r = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "X" }),
    });
    expect(r.status).toBe(401);
    await t.close();
  });
});

describe("PUT /v1/profile/preferences", () => {
  it("accepts valid notification preference updates", async () => {
    const t = await testApp({ suite: "prefs-put" });
    const r = await t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: [{ category: "offers_broadcast", enabled: false }] }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(true);
    await t.close();
  });

  it("401 without session", async () => {
    const t = await testApp({ suite: "prefs-unauth" });
    const r = await t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: [] }),
    });
    expect(r.status).toBe(401);
    await t.close();
  });
});
