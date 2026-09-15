import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("GET /v1/profile", () => {
  it("returns the caller's profile and never another member's", async () => {
    const t = await testApp({ suite: "profile" });
    const a = await t.app.request("/v1/profile", { headers: { Cookie: t.memberA.cookie } });
    expect(a.status).toBe(200);
    const body = (await a.json()) as { memberId: string; status: string };
    expect(body.memberId).toBe(t.memberA.id);
    expect(["active", "waitlist", "pending"]).toContain(body.status);

    const b = await t.app.request("/v1/profile", { headers: { Cookie: t.memberB.cookie } });
    expect(((await b.json()) as { memberId: string }).memberId).toBe(t.memberB.id);

    expect((await t.app.request("/v1/profile")).status).toBe(401);
    await t.close();
  });
});
