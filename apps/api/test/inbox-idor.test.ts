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
});
