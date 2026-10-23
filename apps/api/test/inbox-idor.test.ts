/** Dedicated IDOR coverage for POST /v1/inbox/:id/read (registered path literal for inventory). */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("POST /v1/inbox/:id/read", () => {
  it("member B marking A's notification → 404 and row stays unread; anon → 401", async () => {
    const t = await testApp({ suite: "inbox-idor" });
    const nA = await t.seedNotification(t.memberA.id);

    const asB = await t.app.request(`/v1/inbox/${nA}/read`, {
      method: "POST",
      headers: { Cookie: t.memberB.cookie },
    });
    expect(asB.status).toBe(404);
    expect(await t.isRead(nA)).toBe(false);

    const anon = await t.app.request(`/v1/inbox/${nA}/read`, { method: "POST" });
    expect(anon.status).toBe(401);
    await t.close();
  });

  it("an id that is not a UUID is 404, never a 500; a random UUID is 404 too", async () => {
    const t = await testApp({ suite: "inbox-idor-badid" });
    for (const id of ["abc", "not-a-uuid"]) {
      const r = await t.app.request(`/v1/inbox/${id}/read`, { method: "POST", headers: { Cookie: t.memberA.cookie } });
      expect(r.status).toBe(404);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    }
    const random = await t.app.request(`/v1/inbox/${crypto.randomUUID()}/read`, {
      method: "POST",
      headers: { Cookie: t.memberA.cookie },
    });
    expect(random.status).toBe(404);
    await t.close();
  });
});
