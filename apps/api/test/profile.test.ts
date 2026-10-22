import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
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

describe("PUT /v1/profile/travel — what it stores", () => {
  const put = (t: Awaited<ReturnType<typeof testApp>>, body: unknown) =>
    t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const stored = async (t: Awaited<ReturnType<typeof testApp>>) =>
    (
      (await t.db.execute(sql`SELECT preferences FROM members.profile WHERE member_id = ${t.memberA.id}`)) as {
        preferences: Record<string, unknown>;
      }[]
    )[0]?.preferences;

  it("destinations are three letters, upper-cased, each once in the order sent", async () => {
    const t = await testApp({ suite: "profile-dest" });
    expect((await put(t, { destinations: ["lhr", "LHR", "cdg"] })).status).toBe(200);
    expect((await stored(t))?.destinations).toEqual(["LHR", "CDG"]);
    for (const destinations of [["L1R"], ["L H"], ["ßab"]]) {
      expect((await put(t, { destinations })).status).toBe(400);
    }
    expect((await stored(t))?.destinations).toEqual(["LHR", "CDG"]);
    await t.close();
  });

  it("each infant travels with an adult", async () => {
    const t = await testApp({ suite: "profile-infants" });
    const tooMany = await put(t, { passengers: { adult: 1, child: 0, infant: 4 } });
    expect(tooMany.status).toBe(400);
    const body = (await tooMany.json()) as { error: { details: { path: string; message: string }[] } };
    expect(body.error.details).toContainEqual({
      path: "passengers.infant",
      message: "Each infant travels with an adult.",
    });
    expect((await stored(t))?.passengers).toBeUndefined();
    expect((await put(t, { passengers: { adult: 2, child: 0, infant: 2 } })).status).toBe(200);
    expect((await stored(t))?.passengers).toEqual({ adult: 2, child: 0, infant: 2 });
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

// ADR-IMPL-056: the member's photo (02, 12) — stored and read; no route writes it yet.
describe("GET /v1/profile — the member's photo", () => {
  const URL_A = "https://cdn.example.com/members/daniel.webp";

  it("none until one is stored, then its address — only the caller's; a profile patch never writes it", async () => {
    const t = await testApp({ suite: "profile-avatar" });
    const profile = async (cookie: string) =>
      ProfileVM.parse(await (await t.app.request("/v1/profile", { headers: { Cookie: cookie } })).json());
    expect((await profile(t.memberA.cookie)).avatarUrl).toBeNull();

    await t.db.execute(sql`UPDATE members.profile SET avatar_url = ${URL_A} WHERE member_id = ${t.memberA.id}`);
    expect((await profile(t.memberA.cookie)).avatarUrl).toBe(URL_A);
    expect((await profile(t.memberB.cookie)).avatarUrl).toBeNull();

    // PATCH /v1/profile does not take it: the name changes, the photo stays; a photo alone is no patch at all.
    const patch = (body: Record<string, unknown>) =>
      t.app.request("/v1/profile", {
        method: "PATCH",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await patch({ displayName: "Daniel", avatarUrl: "https://example.com/other.webp" })).status).toBe(200);
    expect((await patch({ avatarUrl: "https://example.com/other.webp" })).status).toBe(400);
    const after = await profile(t.memberA.cookie);
    expect([after.displayName, after.avatarUrl]).toEqual(["Daniel", URL_A]);
    await t.close();
  });

  it("both upgrade orders: an older app drops it, a newer one reads an older server's profile, an odd one is none", () => {
    const vm = {
      memberId: "member-1",
      status: "active",
      email: "daniel@test.dev",
      displayName: "Daniel",
      homeAirport: "JFK",
      timezone: "America/New_York",
      phone: null,
      memberSince: new Date().toISOString(),
      crmLinkedAt: null,
      crmLinked: false,
      preferences: {},
      notifications: { requestUpdates: true, offers: true },
    };
    expect(ProfileVM.omit({ avatarUrl: true }).parse({ ...vm, avatarUrl: URL_A })).not.toHaveProperty("avatarUrl");
    expect(ProfileVM.parse(vm).avatarUrl).toBeUndefined();
    expect(ProfileVM.parse({ ...vm, avatarUrl: URL_A }).avatarUrl).toBe(URL_A);
    expect(ProfileVM.parse({ ...vm, avatarUrl: null }).avatarUrl).toBeNull();
    for (const odd of ["http://cdn.example.com/a.webp", "not a url", "", 7, { url: URL_A }]) {
      const parsed = ProfileVM.parse({ ...vm, avatarUrl: odd });
      expect(parsed.avatarUrl).toBeNull();
      expect(parsed.displayName).toBe("Daniel");
    }
  });
});
