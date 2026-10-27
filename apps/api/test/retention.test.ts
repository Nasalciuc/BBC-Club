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
      INSERT INTO notifications.notifications (member_id, category, title, status, created_at) VALUES
        (${m}, 'transactional', 'old sent', 'sent', now() - interval '91 days'),
        (${m}, 'transactional', 'old pending', 'pending', now() - interval '91 days'),
        (${m}, 'transactional', 'recent', 'sent', now() - interval '10 days')`);
    await t.db.execute(sql`
      INSERT INTO catalog.demand_daily (day, route_from, route_to, cabin, searches, searches_without_fare) VALUES
        (now() - interval '401 days', 'JFK', 'LHR', 'business', 3, 0),
        (now() - interval '399 days', 'JFK', 'LHR', 'business', 3, 0)`);

    for (const job of ["retention-auth", "retention-notifications", "retention-demand"]) {
      const r = await t.platform.jobs.run(job);
      expect(r.error ?? r.status, job).toBe("succeeded");
    }
    expect(await count(t, sql`SELECT count(*)::int n FROM auth.verification WHERE id IN ('v-old', 'v-new')`)).toBe(1);
    expect(await count(t, sql`SELECT count(*)::int n FROM auth.session WHERE id IN ('s-old', 's-recent')`)).toBe(1);
    expect(await count(t, sql`SELECT count(*)::int n FROM auth.rate_limit WHERE id IN ('rl-old', 'rl-new')`)).toBe(1);
    expect(
      await count(
        t,
        sql`SELECT count(*)::int n FROM notifications.notifications WHERE title IN ('old sent', 'old pending', 'recent')`,
      ),
    ).toBe(2); // a pending one is never deleted
    expect(await count(t, sql`SELECT count(*)::int n FROM catalog.demand_daily WHERE route_to = 'LHR'`)).toBe(1);
    await t.close();
  });
});
