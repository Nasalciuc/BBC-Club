/** GET /v1/inbox: IDOR guard, item shape. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("GET /v1/inbox", () => {
  it("returns InboxVM with items and unreadCount", async () => {
    const t = await testApp({ suite: "inbox-basic" });
    await t.seedNotification(t.memberA.id);
    const r = await t.app.request("/v1/inbox", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.unreadCount).toBe("number");
    const item = body.items[0];
    if (item) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("category");
      expect(typeof item.read).toBe("boolean");
      expect(item).toHaveProperty("createdAt");
    }
    await t.close();
  });

  it("member A cannot see member B's inbox (IDOR)", async () => {
    const t = await testApp({ suite: "inbox-idor" });
    const notifId = await t.seedNotification(t.memberB.id);
    const r = await t.app.request("/v1/inbox", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    const ids = body.items.map((i: any) => i.id);
    expect(ids).not.toContain(notifId);
    await t.close();
  });

  it("401 without session", async () => {
    const t = await testApp({ suite: "inbox-unauth" });
    const r = await t.app.request("/v1/inbox");
    expect(r.status).toBe(401);
    await t.close();
  });

  it("unreadCount decreases after markRead", async () => {
    const t = await testApp({ suite: "inbox-markread" });
    const notifId = await t.seedNotification(t.memberA.id);
    const r1 = await t.app.request("/v1/inbox", { headers: { Cookie: t.memberA.cookie } });
    const before = ((await r1.json()) as any).unreadCount;
    await t.app.request(`/v1/inbox/${notifId}/read`, {
      method: "POST",
      headers: { Cookie: t.memberA.cookie },
    });
    const r2 = await t.app.request("/v1/inbox", { headers: { Cookie: t.memberA.cookie } });
    const after = ((await r2.json()) as any).unreadCount;
    expect(after).toBeLessThan(before);
    await t.close();
  });

  it("lists and counts only what reached the member: never a suppressed row or one waiting for its time", async () => {
    const t = await testApp({ suite: "inbox-unsent" });
    const m = t.memberA.id;
    const sent = await t.seedNotification(m);
    // A withdrawn offer's row (offer_withdrawn), and a broadcast queued for the morning (quiet hours).
    await t.db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, deep_link, status, last_error, scheduled_for)
      VALUES (${m}, 'offers_personal', 'Withdrawn offer', 'bbcclub://proposal/x', 'suppressed', 'offer_withdrawn', now()),
             (${m}, 'offers_broadcast', 'Tomorrow morning', 'bbcclub://proposal/y', 'pending', NULL,
              now() + interval '1 day')`);
    // A push that failed stays: the inbox is the in-app record.
    await t.db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, last_error)
      VALUES (${m}, 'transactional', 'Push failed', 'failed', 'BadDeviceToken')`);
    const r = await t.app.request("/v1/inbox", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: { id: string; title: string }[]; unreadCount: number };
    expect(body.items.map((i) => i.title).sort()).toEqual(["Push failed", "Welcome to the club"]);
    expect(body.items.some((i) => i.id === sent)).toBe(true);
    expect(body.unreadCount).toBe(2);
    await t.close();
  });
});
