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
