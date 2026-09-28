/** Campaigns at size: a broadcast to 20 000 members goes out through the job, not the delivery. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("campaign fan-out at 20 000 members", () => {
  it("one campaign, 17 600 notifications in under 10 s (10 % opted out, 2 % already notified today)", async () => {
    const t = await testApp({ suite: "campaigns-20k" });
    await t.db.execute(sql`
      INSERT INTO members.profile (member_id, status, timezone)
      SELECT 'vol-' || lpad(g::text, 6, '0'), 'active', 'Europe/London' FROM generate_series(1, 20000) g`);
    await t.db.execute(sql`
      INSERT INTO members.notification_preferences (member_id, category, enabled)
      SELECT 'vol-' || lpad(g::text, 6, '0'), 'offers_broadcast', false FROM generate_series(1, 20000, 10) g`);
    await t.db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id)
      SELECT 'vol-' || lpad(g::text, 6, '0'), 'offers_personal', 'earlier today', 'pending', gen_random_uuid()
      FROM generate_series(2, 20000, 50) g`);

    const offerId = await t.seedBroadcastOffer({ title: "Your October in London" });
    const d = performance.now();
    await t.drainAll();
    const deliveryMs = performance.now() - d;

    const start = performance.now();
    const r = await t.app.request("/v1/internal/run/campaign-fanout", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    const ms = performance.now() - start;
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string; metrics?: Record<string, number> };
    expect(body.status).toBe("succeeded");
    console.log(
      `[campaigns] 20 000 members: delivery ${deliveryMs.toFixed(0)} ms · fan-out ${ms.toFixed(0)} ms · ${JSON.stringify(body.metrics)}`,
    );

    const [{ n }]: any = await t.db.execute(sql`
      SELECT count(*)::int n FROM notifications.notifications
      WHERE offer_id = ${offerId}::uuid AND member_id LIKE 'vol-%'`);
    expect(n).toBe(17_600);
    expect(body.metrics?.campaigns).toBe(1);
    expect(ms).toBeLessThan(10_000);
    await t.close();
  }, 60_000);
});
