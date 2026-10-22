/** PATCH /v1/profile + PUT /v1/profile/preferences: member-scoped update. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { ProfileVM } from "@bbc/shared/api/v1/profile";
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

  it("answers the ProfileVM the app reads, as GET and the travel save do (ADR-IMPL-025)", async () => {
    const t = await testApp({ suite: "profile-patch-vm" });
    await t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: [
          { category: "offers_personal", enabled: false },
          { category: "offers_broadcast", enabled: false },
        ],
      }),
    });
    const r = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ homeAirport: "LHR" }),
    });
    expect(r.status).toBe(200);
    const parsed = ProfileVM.safeParse(await r.json());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.email).toBe(t.memberA.email);
    expect(parsed.data?.memberId).toBe(t.memberA.id);
    expect(parsed.data?.homeAirport).toBe("LHR");
    expect(parsed.data?.notifications).toEqual({ requestUpdates: true, offers: false });
    // The same profile GET answers.
    const get = ProfileVM.parse(
      await (await t.app.request("/v1/profile", { headers: { Cookie: t.memberA.cookie } })).json(),
    );
    expect(parsed.data).toEqual(get);
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

  it("takes a time zone the clocks can read, never any string (one bad zone stopped every campaign)", async () => {
    const t = await testApp({ suite: "profile-tz" });
    const patch = (timezone: string) =>
      t.app.request("/v1/profile", {
        method: "PATCH",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });
    const bad = await patch("Not/AZone");
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: string; details: { path: string; message: string }[] } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details).toContainEqual({ path: "timezone", message: "Choose a time zone from the list." });
    const stored = async () =>
      (
        (await t.db.execute(sql`SELECT timezone FROM members.profile WHERE member_id = ${t.memberA.id}`)) as {
          timezone: string;
        }[]
      )[0]?.timezone;
    expect(await stored()).not.toBe("Not/AZone");

    expect((await patch("Asia/Tokyo")).status).toBe(200);
    expect(await stored()).toBe("Asia/Tokyo");
    expect((await patch("UTC")).status).toBe(200);
    expect(await stored()).toBe("UTC");
    await t.close();
  });

  it("a home airport is three letters, upper-cased (the request legs' rule): never 500, never 'L H'", async () => {
    const t = await testApp({ suite: "profile-iata" });
    const patch = (homeAirport: string) =>
      t.app.request("/v1/profile", {
        method: "PATCH",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ homeAirport }),
      });
    // 'ßab' upper-cases to 'SSAB' (CHECK profile_iata_len → 500); '😀A' is three UTF-16 units, two characters.
    for (const code of ["ßab", "😀A", "L H", "123", "LH", "LHRX"]) {
      const r = await patch(code);
      expect([code, r.status]).toEqual([code, 400]);
    }
    expect((await patch("lhr")).status).toBe(200);
    const [row] = (await t.db.execute(
      sql`SELECT home_airport FROM members.profile WHERE member_id = ${t.memberA.id}`,
    )) as { home_airport: string }[];
    expect(row?.home_airport).toBe("LHR");
    await t.close();
  });

  it("a phone is stored in E.164, the form a request's contact takes — never as typed", async () => {
    const t = await testApp({ suite: "profile-phone" });
    const patch = (phone: string) =>
      t.app.request("/v1/profile", {
        method: "PATCH",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
    const stored = async () =>
      (
        (await t.db.execute(sql`SELECT phone FROM members.profile WHERE member_id = ${t.memberA.id}`)) as {
          phone: string | null;
        }[]
      )[0]?.phone;
    const requestPhone = RequestBody.innerType().shape.contact.shape.phone;

    const typed = await patch("(212) 555-0101");
    expect(typed.status).toBe(200);
    expect(((await typed.json()) as { phone: string }).phone).toBe("+12125550101");
    expect(await stored()).toBe("+12125550101");
    expect(requestPhone.safeParse(await stored()).success).toBe(true);

    // An extension has no place in E.164 (nor in the app's PhoneSheet, which sends parsed.e164): the number is kept.
    expect((await patch("+1 212 555 0100 ext. 12345")).status).toBe(200);
    expect(await stored()).toBe("+12125550100");
    expect(requestPhone.safeParse(await stored()).success).toBe(true);

    expect((await patch("abc")).status).toBe(400);
    expect(await stored()).toBe("+12125550100");
    await t.close();
  });

  it("a name is trimmed, and a blank one is refused", async () => {
    const t = await testApp({ suite: "profile-name" });
    const patch = (displayName: string) =>
      t.app.request("/v1/profile", {
        method: "PATCH",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
    const stored = async () =>
      (
        (await t.db.execute(sql`SELECT display_name FROM members.profile WHERE member_id = ${t.memberA.id}`)) as {
          display_name: string | null;
        }[]
      )[0]?.display_name;
    expect((await patch("   ")).status).toBe(400);
    expect(await stored()).toBe("Alex Morgan");
    expect((await patch("  Ana  ")).status).toBe(200);
    expect(await stored()).toBe("Ana");
    await t.close();
  });

  it("text Postgres cannot keep as sent (U+0000, a surrogate without its pair) is 400, never 500", async () => {
    const t = await testApp({ suite: "profile-nul" });
    const name = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "a\u0000b" }),
    });
    expect(name.status).toBe(400);
    const notes = await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "window seat\u0000" }),
    });
    expect(notes.status).toBe(400);

    // A surrogate without its pair, as JSON can carry it: jsonb refuses the escape (travel notes answered 500), text
    // would keep U+FFFD instead of what was sent. A pair (an emoji) is text like any other.
    const send = (method: string, path: string, body: string) =>
      t.app.request(path, {
        method,
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body,
      });
    for (const [method, path, body] of [
      ["PUT", "/v1/profile/travel", '{"notes":"window \\ud800 seat"}'],
      ["PUT", "/v1/profile/travel", '{"notes":"\\udc00"}'],
      ["PATCH", "/v1/profile", '{"displayName":"An\\ud83d"}'],
    ] as const) {
      const r = await send(method, path, body);
      expect([body, r.status]).toEqual([body, 400]);
      const details = ((await r.json()) as { error: { details: { message: string }[] } }).error.details;
      expect(details[0]?.message).toBe("That text has a character we can't keep. Remove it and try again.");
    }
    expect((await send("PUT", "/v1/profile/travel", JSON.stringify({ notes: "Window seat ✈️ 🛫" }))).status).toBe(200);
    expect((await send("PATCH", "/v1/profile", JSON.stringify({ displayName: "Ana 😀" }))).status).toBe(200);
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

  it("writes both offer categories from one update", async () => {
    const t = await testApp({ suite: "prefs-both" });
    const r = await t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: [
          { category: "offers_personal", enabled: false },
          { category: "offers_broadcast", enabled: false },
        ],
      }),
    });
    expect(r.status).toBe(200);
    const rows = (await t.db.execute(sql`
      SELECT category, enabled FROM members.notification_preferences
      WHERE member_id = ${t.memberA.id}
      ORDER BY category`)) as { category: string; enabled: boolean }[];
    expect(rows.map((row) => [row.category, row.enabled])).toEqual([
      ["offers_personal", false],
      ["offers_broadcast", false],
    ]);
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
