/** ADR-IMPL-077: each module's retention job deletes what aged out of its own tables, and nothing else. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

const count = async (t: Awaited<ReturnType<typeof testApp>>, q: ReturnType<typeof sql>) =>
  ((await t.db.execute(q)) as unknown as { n: number }[])[0]!.n;

describe("retention jobs", () => {
  it("auth, notifications and demand keep what they should and delete the rest", async () => {
    const t = await testApp({ suite: "retention" });
    const m = t.memberA.id;
    await t.db.execute(sql`
      INSERT INTO auth.verification (id, identifier, value, expires_at) VALUES
        ('v-old', 'x@test.dev', 'h', now() - interval '2 days'), ('v-new', 'y@test.dev', 'h', now() + interval '1 hour')`);
    await t.db.execute(sql`
      INSERT INTO auth.session (id, user_id, token, expires_at) VALUES
        ('s-old', ${m}, 'tok-old', now() - interval '8 days'), ('s-recent', ${m}, 'tok-recent', now() - interval '6 days')`);
    await t.db.execute(sql`
      INSERT INTO auth.rate_limit (id, key, count, last_request) VALUES
        ('rl-old', '1.2.3.4/sign-in', 1, (extract(epoch FROM now() - interval '3 hours') * 1000)::bigint),
        ('rl-new', '1.2.3.5/sign-in', 1, (extract(epoch FROM now()) * 1000)::bigint)`);
    await t.db.execute(sql`
      INSERT INTO auth.otp_cooldown (key, last_sent_at) VALUES
        ('cd-old', now() - interval '25 hours'), ('cd-new', now() - interval '23 hours')`);
    await t.db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, created_at) VALUES
        (${m}, 'transactional', 'old sent', 'sent', now() - interval '91 days'),
        (${m}, 'transactional', 'old pending', 'pending', now() - interval '91 days'),
        (${m}, 'transactional', 'recent', 'sent', now() - interval '10 days')`);
    await t.db.execute(sql`
      INSERT INTO notifications.campaigns (offer_id, source_event_id, category, title, status, finished_at) VALUES
        (gen_random_uuid(), 'rt-old', 'offers_broadcast', 'old done', 'done', now() - interval '181 days'),
        (gen_random_uuid(), 'rt-recent', 'offers_broadcast', 'recent done', 'done', now() - interval '179 days'),
        (gen_random_uuid(), 'rt-running', 'offers_broadcast', 'running', 'running', NULL)`);
    await t.db.execute(sql`
      INSERT INTO catalog.demand_daily (day, route_from, route_to, cabin, searches, searches_without_fare) VALUES
        (now() - interval '401 days', 'JFK', 'LHR', 'business', 3, 0),
        (now() - interval '399 days', 'JFK', 'LHR', 'business', 3, 0)`);

    const metrics: Record<string, number> = {};
    for (const job of ["retention-auth", "retention-notifications", "retention-demand"]) {
      const r = await t.platform.jobs.run(job);
      expect(r.error ?? r.status, job).toBe("succeeded");
      Object.assign(metrics, r.metrics);
    }
    for (const key of [
      "sessions",
      "verifications",
      "rateLimits",
      "otpCooldowns",
      "notifications",
      "campaigns",
      "demandDays",
    ])
      expect(metrics[`${key}Deleted`], key).toBeGreaterThanOrEqual(1);
    expect(await count(t, sql`SELECT count(*)::int n FROM auth.verification WHERE id IN ('v-old', 'v-new')`)).toBe(1);
    expect(await count(t, sql`SELECT count(*)::int n FROM auth.session WHERE id IN ('s-old', 's-recent')`)).toBe(1);
    expect(await count(t, sql`SELECT count(*)::int n FROM auth.rate_limit WHERE id IN ('rl-old', 'rl-new')`)).toBe(1);
    // The OTP cooldowns are the club's own, in auth: identity's retention-auth deletes them after a day.
    expect(await count(t, sql`SELECT count(*)::int n FROM auth.otp_cooldown WHERE key IN ('cd-old', 'cd-new')`)).toBe(
      1,
    );
    expect(
      await count(
        t,
        sql`SELECT count(*)::int n FROM notifications.notifications WHERE title IN ('old sent', 'old pending', 'recent')`,
      ),
    ).toBe(2); // a pending one is never deleted
    expect(
      await count(
        t,
        sql`SELECT count(*)::int n FROM notifications.campaigns WHERE source_event_id IN ('rt-old', 'rt-recent', 'rt-running')`,
      ),
    ).toBe(2); // a campaign still running is never deleted
    expect(await count(t, sql`SELECT count(*)::int n FROM catalog.demand_daily WHERE route_to = 'LHR'`)).toBe(1);
    await t.close();
  });
});
