/** Gate 3: offer.published → inbox row → dispatch via PushSender. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("notifications fan-out + dispatch", () => {
  it("broadcast publish creates an inbox row for active members, then dispatch delivers push", async () => {
    const t = await testApp({ suite: "notif-fanout" });

    // Register a device so dispatch has a token to send to.
    const deviceId = "dev-notif-" + crypto.randomUUID();
    const nativeToken = "tok-notif-" + crypto.randomUUID();
    const reg = await t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, platform: "ios", nativeToken }),
    });
    expect(reg.status).toBe(201);

    const offerId = await t.seedBroadcastOffer({ title: "Autumn in Paris" });
    await t.drainAll(); // offer.published → onOfferPublished

    const rows: any[] = await t.db.execute(sql`
      SELECT id, category, status, title, offer_id
      FROM notifications.notifications
      WHERE member_id = ${t.memberA.id} AND offer_id = ${offerId}`);
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe("offers_broadcast");
    expect(rows[0].title).toBe("Autumn in Paris");
    expect(["pending", "sent", "delivered"]).toContain(rows[0].status);

    // Waitlist member B must not get a broadcast row.
    const bRows: any[] = await t.db.execute(sql`
      SELECT id FROM notifications.notifications
      WHERE member_id = ${t.memberB.id} AND offer_id = ${offerId}`);
    expect(bRows.length).toBe(0);

    // Inbox shows the row before/after dispatch.
    const inbox = await t.app.request("/v1/inbox", { headers: { Cookie: t.memberA.cookie } });
    expect(inbox.status).toBe(200);
    const inboxBody = (await inbox.json()) as { items: { offerId?: string; title: string }[] };
    expect(inboxBody.items.some((i) => i.offerId === offerId)).toBe(true);

    // Force due now in case quiet hours pushed scheduled_for forward.
    await t.db.execute(sql`
      UPDATE notifications.notifications
      SET scheduled_for = now() - interval '1 second'
      WHERE offer_id = ${offerId} AND member_id = ${t.memberA.id}`);

    const before = t.push.sent.length;
    const job = await t.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(job.status).toBe(200);
    const jobBody = (await job.json()) as { status: string; metrics?: Record<string, number> };
    expect(jobBody.status).toBe("succeeded");

    expect(t.push.sent.length).toBeGreaterThan(before);
    const last = t.push.sent[t.push.sent.length - 1] as { token: string; title: string; data?: Record<string, string> };
    expect(last.token).toBe(nativeToken);
    expect(last.title).toBe("Autumn in Paris");
    expect(last.data?.offerId).toBe(offerId);

    const after: any[] = await t.db.execute(sql`
      SELECT status, ticket_id FROM notifications.notifications
      WHERE member_id = ${t.memberA.id} AND offer_id = ${offerId}`);
    expect(after[0].status).toBe("delivered");
    expect(after[0].ticket_id).toBeTruthy();

    const delivered = await t.journal.byType("notification.delivered");
    expect(delivered.length).toBeGreaterThan(0);

    await t.close();
  });

  it("offer.published fan-out is idempotent (duplicate delivery does not double-notify)", async () => {
    const t = await testApp({ suite: "notif-idem" });
    const offerId = await t.seedBroadcastOffer({ title: "Idempotent Paris" });
    await t.drainAll();
    await t.drainAll(); // second drain should be a no-op for already-processed deliveries

    const [{ n }]: any = await t.db.execute(sql`
      SELECT count(*)::int n FROM notifications.notifications
      WHERE member_id = ${t.memberA.id} AND offer_id = ${offerId}`);
    expect(n).toBe(1);
    await t.close();
  });

  it("disabled offers_broadcast preference skips fan-out", async () => {
    const t = await testApp({ suite: "notif-pref" });
    await t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: [{ category: "offers_broadcast", enabled: false }] }),
    });

    const offerId = await t.seedBroadcastOffer({ title: "Muted" });
    await t.drainAll();

    const [{ n }]: any = await t.db.execute(sql`
      SELECT count(*)::int n FROM notifications.notifications
      WHERE member_id = ${t.memberA.id} AND offer_id = ${offerId}`);
    expect(n).toBe(0);
    await t.close();
  });
});
