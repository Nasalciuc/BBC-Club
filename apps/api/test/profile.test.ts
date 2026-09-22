import { describe, it, expect } from "bun:test";
import { ProfileVM } from "@bbc/shared/api/v1/profile";
import { testApp } from "./helpers/test-app";

describe("GET /v1/profile", () => {
  it("returns the caller's profile and never another member's", async () => {
    const t = await testApp({ suite: "profile" });
    const a = await t.app.request("/v1/profile", { headers: { Cookie: t.memberA.cookie } });
    expect(a.status).toBe(200);
    const body = ProfileVM.parse(await a.json());
    expect(body.memberId).toBe(t.memberA.id);
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
