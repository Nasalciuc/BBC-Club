import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("POST /v1/internal/offers/:id/withdraw", () => {
  it("publishes offer.withdrawn once and suppresses pending inbox rows", async () => {
    const t = await testApp({ suite: "withdraw" });
    const offerId = await t.seedBroadcastOffer();
    await t.drainAll();

    await t.db.execute(sql`
      INSERT INTO notifications.notifications
        (member_id, category, title, status, offer_id)
      VALUES (${t.memberA.id}, 'offers_personal', 'x', 'pending', ${offerId}::uuid)
      ON CONFLICT DO NOTHING`);
    await t.db.execute(sql`
      UPDATE notifications.notifications
      SET status = 'pending', last_error = NULL
      WHERE offer_id = ${offerId} AND member_id = ${t.memberA.id}`);

    const first = await t.app.request(`/v1/internal/offers/${offerId}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
      body: JSON.stringify({ reason: "fare gone" }),
    });
    expect(first.status).toBe(200);
    await t.drainAll();

    const rows: any[] = await t.db.execute(sql`
      SELECT status, last_error FROM notifications.notifications
      WHERE offer_id = ${offerId} AND member_id = ${t.memberA.id} AND status = 'suppressed'`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.last_error === "offer_withdrawn")).toBe(true);

    const journal = await t.journal.byType("offer.withdrawn");
    expect(journal.length).toBe(1);

    const second = await t.app.request(`/v1/internal/offers/${offerId}/withdraw`, {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(second.status).toBe(404);
    await t.drainAll();
    expect((await t.journal.byType("offer.withdrawn")).length).toBe(1);

    expect(
      (
        await t.app.request(`/v1/internal/offers/${offerId}/withdraw`, {
          method: "POST",
          headers: { Cookie: t.memberA.cookie },
        })
      ).status,
    ).toBe(403);

    await t.close();
  });
});
