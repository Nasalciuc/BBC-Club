import { describe, it, expect } from "bun:test";
import { ProfileVM } from "@bbc/shared/api/v1/profile";
import { testApp } from "./helpers/test-app";

describe("GET /v1/profile", () => {
  it("returns the caller's profile with email and never another member's", async () => {
    const t = await testApp({ suite: "profile" });
    const a = await t.app.request("/v1/profile", { headers: { Cookie: t.memberA.cookie } });
    expect(a.status).toBe(200);
    const body = ProfileVM.parse(await a.json());
    expect(body.memberId).toBe(t.memberA.id);
    expect(body.email).toBe(t.memberA.email);
    expect(["active", "waitlist", "pending"]).toContain(body.status);
    expect(body.timezone).toBeTruthy();
    expect(typeof body.crmLinked).toBe("boolean");
    expect(body.preferences).toBeDefined();

    const b = await t.app.request("/v1/profile", { headers: { Cookie: t.memberB.cookie } });
    expect(ProfileVM.parse(await b.json()).memberId).toBe(t.memberB.id);

    expect((await t.app.request("/v1/profile")).status).toBe(401);
    await t.close();
  });
});

describe("PUT /v1/profile/travel", () => {
  it("merges preferences and stays self-scoped", async () => {
    const t = await testApp({ suite: "profile-travel" });

    const cabin = await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ cabin: "first" }),
    });
    expect(cabin.status).toBe(200);
    const afterCabin = ProfileVM.parse(await cabin.json());
    expect(afterCabin.preferences.cabin).toBe("first");
    expect(afterCabin.email).toBe(t.memberA.email);

    const pax = await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ passengers: { adult: 2, child: 0, infant: 0 } }),
    });
    expect(pax.status).toBe(200);
    const afterPax = ProfileVM.parse(await pax.json());
    expect(afterPax.preferences.cabin).toBe("first");
    expect(afterPax.preferences.passengers).toEqual({ adult: 2, child: 0, infant: 0 });

    const bBefore = ProfileVM.parse(
      await (await t.app.request("/v1/profile", { headers: { Cookie: t.memberB.cookie } })).json(),
    );
    await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ cabin: "business" }),
    });
    const bAfter = ProfileVM.parse(
      await (await t.app.request("/v1/profile", { headers: { Cookie: t.memberB.cookie } })).json(),
    );
    expect(bAfter.preferences).toEqual(bBefore.preferences);

    expect(
      (
        await t.app.request("/v1/profile/travel", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cabin: "first" }),
        })
      ).status,
    ).toBe(401);

    await t.close();
  });
});

describe("GET /v1/profile — notifications (ADR-IMPL-025)", () => {
  const put = (
    t: Awaited<ReturnType<typeof testApp>>,
    cookie: string,
    prefs: { category: string; enabled: boolean }[],
  ) =>
    t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: prefs }),
    });
  const get = async (t: Awaited<ReturnType<typeof testApp>>, cookie: string) =>
    ProfileVM.parse(await (await t.app.request("/v1/profile", { headers: { Cookie: cookie } })).json()).notifications;

  it("reads back what the member saved, and only theirs", async () => {
    const t = await testApp({ suite: "profile-notifications" });
    // Nothing saved: a missing preference row means on.
    expect(await get(t, t.memberA.cookie)).toEqual({ requestUpdates: true, offers: true });

    // Offers off (what the sheet sends: both categories) → GET shows off, after a "restart" (a fresh GET).
    expect(
      (
        await put(t, t.memberA.cookie, [
          { category: "offers_personal", enabled: false },
          { category: "offers_broadcast", enabled: false },
        ])
      ).status,
    ).toBe(200);
    expect(await get(t, t.memberA.cookie)).toEqual({ requestUpdates: true, offers: false });
    expect(await get(t, t.memberB.cookie)).toEqual({ requestUpdates: true, offers: true });

    // One category back on → offers is on.
    await put(t, t.memberA.cookie, [{ category: "offers_broadcast", enabled: true }]);
    expect((await get(t, t.memberA.cookie)).offers).toBe(true);

    // The travel save returns a ProfileVM too, with the same saved value.
    await put(t, t.memberA.cookie, [{ category: "offers_broadcast", enabled: false }]);
    const travel = await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ cabin: "first" }),
    });
    expect(ProfileVM.parse(await travel.json()).notifications).toEqual({ requestUpdates: true, offers: false });
    await t.close();
  });
});
