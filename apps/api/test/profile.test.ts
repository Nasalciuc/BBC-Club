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

describe("profile writes right after the join code (member.registered not yet delivered)", () => {
  it("the first save makes the profile row; the delivery then adds nothing and links to the CRM once", async () => {
    const suite = "profile-early";
    const carol = `carol.${suite}@test.dev`; // known to the CRM → active
    const dave = `dave.${suite}@test.dev`; // unknown → waitlist (ADR-PROD-001)
    const t = await testApp({
      suite,
      knownClients: [
        {
          email: `alex.${suite}@test.dev`,
          crmClientId: `crm_alex_${suite}`,
          fullName: "Alex Morgan",
          homeAirport: "JFK",
        },
        { email: carol, crmClientId: `crm_carol_${suite}`, fullName: "Carol King", homeAirport: "BOS" },
      ],
    });
    const join = async (email: string) => {
      const m = await t.auth.createMember(email);
      return { ...m, cookie: await t.auth.cookieFor(email) };
    };
    const rows = async (memberId: string) =>
      (await t.db.execute(sql`SELECT status, crm_client_id, home_airport, preferences FROM members.profile
        WHERE member_id = ${memberId}`)) as {
        status: string;
        crm_client_id: string | null;
        home_airport: string | null;
        preferences: Record<string, unknown>;
      }[];
    const linked = async (memberId: string) =>
      (await t.journal.forMember(memberId)).filter(
        (e: { payload: { type: string } }) => e.payload.type === "member.linked_to_crm",
      );

    // No drain: member.registered is queued, the profile row does not exist yet.
    const c = await join(carol);
    const d = await join(dave);
    expect(await rows(c.id)).toEqual([]);

    const patch = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: c.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ homeAirport: "LHR" }),
    });
    expect(patch.status).toBe(200);
    expect(ProfileVM.parse(await patch.json()).homeAirport).toBe("LHR");
    const travel = await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: d.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ cabin: "first" }),
    });
    expect(travel.status).toBe(200);
    expect(ProfileVM.parse(await travel.json()).preferences.cabin).toBe("first");
    // The save made the row the delivery would have made — and published no link of its own.
    expect(await rows(c.id)).toEqual([
      { status: "active", crm_client_id: `crm_carol_${suite}`, home_airport: "LHR", preferences: {} },
    ]);
    expect(await rows(d.id)).toEqual([
      { status: "waitlist", crm_client_id: null, home_airport: null, preferences: { cabin: "first" } },
    ]);
    expect(await linked(c.id)).toEqual([]);

    await t.drainAll();
    // One row each, the member's saves intact; the delivery published the CRM link exactly once.
    expect(await rows(c.id)).toEqual([
      { status: "active", crm_client_id: `crm_carol_${suite}`, home_airport: "LHR", preferences: {} },
    ]);
    expect(await rows(d.id)).toEqual([
      { status: "waitlist", crm_client_id: null, home_airport: null, preferences: { cabin: "first" } },
    ]);
    const links = await linked(c.id);
    expect(links).toHaveLength(1);
    expect(links[0].payload.crmClientId).toBe(`crm_carol_${suite}`);
    expect(await linked(d.id)).toEqual([]);
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
