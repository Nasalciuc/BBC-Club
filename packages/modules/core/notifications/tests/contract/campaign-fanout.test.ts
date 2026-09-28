/** Campaigns: a broadcast delivery records one row; the campaign-fanout job pages through the audience.
 *  The audience here is the members facade's query, verbatim — this module may not import members internals. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { AudienceMember, MembersFacade } from "@bbc/members";
import { onOfferPublished } from "../../src/handlers/on-offer-published";
import { campaignFanout, type CampaignFanoutDeps } from "../../src/application/campaign-fanout";
import { onOfferExpired, onOfferWithdrawn } from "../../src/handlers/on-offer-lifecycle";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("notif-campaigns", { max: 4 });
  db = iso.db;
});
afterAll(() => iso.drop());

beforeEach(async () => {
  await db.execute(sql`DELETE FROM notifications.notifications`);
  await db.execute(sql`DELETE FROM notifications.campaigns`);
  await db.execute(sql`DELETE FROM members.notification_preferences`);
  await db.execute(sql`DELETE FROM members.profile`);
});

type Page = MembersFacade["audiencePage"];
const audiencePage: Page = async (_exec, q) =>
  (
    (await db.execute(sql`
    SELECT m.member_id, m.timezone
    FROM members.profile m
    WHERE m.status = 'active'
      AND (${q.after}::text IS NULL OR m.member_id > ${q.after})
      AND NOT EXISTS (SELECT 1 FROM members.notification_preferences p
                      WHERE p.member_id = m.member_id AND p.category = ${q.category} AND p.enabled = false)
    ORDER BY m.member_id
    LIMIT ${q.limit}`)) as unknown as { member_id: string; timezone: string }[]
  ).map((r): AudienceMember => ({ memberId: r.member_id, timezone: r.timezone }));

const members = { audiencePage } as unknown as MembersFacade;

async function seedMembers(n: number, tz = "Europe/London") {
  await db.execute(sql`
    INSERT INTO members.profile (member_id, status, timezone)
    SELECT 'cm-' || lpad(g::text, 6, '0'), 'active', ${tz} FROM generate_series(1, ${n}) g`);
}
const mid = (n: number) => `cm-${String(n).padStart(6, "0")}`;

function broadcast(offerId = crypto.randomUUID()) {
  return {
    type: "offer.published",
    version: 1,
    offerId,
    targeting: "broadcast",
    targetMemberId: null,
    routeFrom: "JFK",
    routeTo: "LHR",
    cabin: "business",
    title: "Your October in London",
    validUntil: "2027-12-31T23:59:59.000Z",
    publishedAt: "2026-09-28T09:00:00.000Z",
  };
}

async function deliver(payload: unknown, sourceEventId: string) {
  await db.transaction(async (tx) => {
    await onOfferPublished({ tx, members, sourceEventId }, payload);
  });
}

const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0]?.n);
const notificationCount = () => count(sql`SELECT count(*)::int AS n FROM notifications.notifications`);

function run(extra: Partial<CampaignFanoutDeps> = {}) {
  return campaignFanout({ db, members, ...extra });
}

describe("broadcast delivery", () => {
  it("writes exactly one campaign and zero notifications, fast, whatever the audience", async () => {
    await seedMembers(5_000);
    const t = performance.now();
    await deliver(broadcast(), "101");
    const ms = performance.now() - t;
    expect(ms).toBeLessThan(100);
    expect(await count(sql`SELECT count(*)::int AS n FROM notifications.campaigns`)).toBe(1);
    expect(await notificationCount()).toBe(0);
    const [c] = (await db.execute(sql`SELECT status, category, body, deep_link FROM notifications.campaigns`)) as any[];
    expect(c).toMatchObject({ status: "pending", category: "offers_broadcast", body: "JFK → LHR" });
  });

  it("the same event delivered twice starts one campaign", async () => {
    const p = broadcast();
    await deliver(p, "202");
    await deliver(p, "202");
    expect(await count(sql`SELECT count(*)::int AS n FROM notifications.campaigns`)).toBe(1);
  });
});

describe("campaign-fanout job", () => {
  it("fans out to every eligible member, page by page, then marks the campaign done", async () => {
    await seedMembers(1_050);
    await db.execute(sql`
      INSERT INTO members.notification_preferences (member_id, category, enabled)
      VALUES (${mid(3)}, 'offers_broadcast', false), (${mid(4)}, 'offers_personal', false)`);
    // Already notified with an offer today → capped (server day). An older offer does not cap.
    await db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id)
      VALUES (${mid(5)}, 'offers_personal', 'earlier today', 'pending', gen_random_uuid())`);
    await db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id, created_at)
      VALUES (${mid(6)}, 'offers_personal', 'last week', 'pending', gen_random_uuid(), now() - interval '7 days')`);
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "303");

    const m = await run({ pageSize: 100 });
    expect(m).toEqual({ campaigns: 1, pages: 11, inserted: 1_048, capped: 1 });

    const rows = (await db.execute(sql`
      SELECT member_id, source_event_id, deep_link FROM notifications.notifications
      WHERE offer_id = ${offerId}::uuid ORDER BY member_id`)) as any[];
    expect(rows).toHaveLength(1_048);
    const ids = new Set(rows.map((r) => r.member_id));
    expect(ids.has(mid(3))).toBe(false); // opted out of broadcasts
    expect(ids.has(mid(4))).toBe(true); // opted out of personal offers only
    expect(ids.has(mid(5))).toBe(false); // capped
    expect(ids.has(mid(6))).toBe(true);
    expect(rows[0]).toMatchObject({ source_event_id: "303", deep_link: `bbcclub://proposal/${offerId}` });

    const [c] = (await db.execute(
      sql`SELECT status, last_member_id, finished_at FROM notifications.campaigns`,
    )) as any[];
    expect(c.status).toBe("done");
    expect(c.last_member_id).toBe(mid(1_050));
    expect(c.finished_at).not.toBeNull();

    expect(await run({ pageSize: 100 })).toEqual({ campaigns: 0, pages: 0, inserted: 0, capped: 0 });
  });

  it("schedules each row after the member's quiet hours", async () => {
    await db.execute(sql`
      INSERT INTO members.profile (member_id, status, timezone) VALUES
        ('qh-london', 'active', 'Europe/London'), ('qh-tokyo', 'active', 'Asia/Tokyo')`);
    await deliver(broadcast(), "404");
    const late = new Date("2026-09-28T14:00:00.000Z"); // 15:00 in London, 23:00 in Tokyo (quiet hours)
    await run({ now: () => late });
    const rows = (await db.execute(sql`
      SELECT member_id, scheduled_for FROM notifications.notifications ORDER BY member_id`)) as any[];
    const at = Object.fromEntries(rows.map((r) => [r.member_id, new Date(r.scheduled_for).getTime()]));
    expect(at["qh-london"]).toBe(late.getTime());
    expect(at["qh-tokyo"]).toBeGreaterThan(late.getTime()); // pushed to 08:00 Tokyo
  });

  it("20 000 members during quiet hours still fan out in under 10 s", async () => {
    await seedMembers(20_000);
    await deliver(broadcast(), "450");
    const night = new Date("2026-09-28T22:30:00.000Z"); // 23:30 in London
    const t = performance.now();
    const m = await run({ now: () => night });
    const ms = performance.now() - t;
    console.log(`[campaigns] 20 000 members at 23:30 local: ${ms.toFixed(0)} ms`);
    expect(m).toMatchObject({ campaigns: 1, pages: 20, inserted: 20_000 });
    expect(ms).toBeLessThan(10_000);
    const [{ n }] = (await db.execute(sql`
      SELECT count(DISTINCT scheduled_for)::int AS n FROM notifications.notifications`)) as unknown as { n: number }[];
    expect(n).toBe(1); // everyone in London gets 08:00 local
  }, 60_000);

  it("a crash after page 7 resumes at page 8, without duplicates", async () => {
    await seedMembers(1_000);
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "505");

    let calls = 0;
    const crashing = {
      audiencePage: (async (exec, q) => {
        calls += 1;
        if (calls === 8) throw new Error("worker killed");
        return audiencePage(exec, q);
      }) as Page,
    } as unknown as MembersFacade;
    await expect(campaignFanout({ db, members: crashing, pageSize: 100 })).rejects.toThrow("worker killed");

    const [mid7] = (await db.execute(sql`SELECT status, last_member_id FROM notifications.campaigns`)) as any[];
    expect(mid7).toEqual({ status: "running", last_member_id: mid(700) });
    expect(await notificationCount()).toBe(700);

    const resumed = await run({ pageSize: 100 });
    expect(resumed).toEqual({ campaigns: 1, pages: 3, inserted: 300, capped: 0 });
    expect(
      await count(sql`SELECT count(DISTINCT member_id)::int AS n FROM notifications.notifications
                      WHERE offer_id = ${offerId}::uuid`),
    ).toBe(1_000);
    expect(await notificationCount()).toBe(1_000);
  });

  it("an aborted run leaves the campaign running at its cursor", async () => {
    await seedMembers(300);
    await deliver(broadcast(), "606");
    const ctl = new AbortController();
    let calls = 0;
    const aborting = {
      audiencePage: (async (exec, q) => {
        calls += 1;
        if (calls === 2) ctl.abort();
        return audiencePage(exec, q);
      }) as Page,
    } as unknown as MembersFacade;
    const m = await campaignFanout({ db, members: aborting, pageSize: 100, signal: ctl.signal });
    expect(m).toEqual({ campaigns: 0, pages: 2, inserted: 200, capped: 0 });
    const [c] = (await db.execute(sql`SELECT status, last_member_id FROM notifications.campaigns`)) as any[];
    expect(c).toEqual({ status: "running", last_member_id: mid(200) });
    expect(await run({ pageSize: 100 })).toEqual({ campaigns: 1, pages: 1, inserted: 100, capped: 0 });
  });
});

describe("a withdrawn or expired offer", () => {
  const withdraw = (offerId: string) =>
    db.transaction((tx) =>
      onOfferWithdrawn({ tx }, { type: "offer.withdrawn", version: 1, offerId, withdrawnAt: new Date().toISOString() }),
    );
  const expire = (offerId: string) =>
    db.transaction((tx) =>
      onOfferExpired({ tx }, { type: "offer.expired", version: 1, offerId, expiredAt: new Date().toISOString() }),
    );
  const campaignOf = async (offerId: string) =>
    (
      (await db.execute(sql`SELECT status, last_member_id, finished_at IS NOT NULL AS finished
      FROM notifications.campaigns WHERE offer_id = ${offerId}::uuid`)) as any[]
    )[0];

  it("withdrawn before the job runs: the campaign closes and nothing is written", async () => {
    await seedMembers(300);
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "707");
    await withdraw(offerId);
    expect(await run({ pageSize: 100 })).toEqual({ campaigns: 0, pages: 0, inserted: 0, capped: 0 });
    expect(await notificationCount()).toBe(0);
    expect(await campaignOf(offerId)).toEqual({ status: "done", last_member_id: null, finished: true });
  });

  it("expired mid-run: the claimed campaign stops at the next page, and what it wrote is suppressed", async () => {
    await seedMembers(500);
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "808");
    let calls = 0;
    const expiring = {
      audiencePage: (async (exec, q) => {
        calls += 1;
        if (calls === 3) await expire(offerId); // two pages are committed; the third must not be
        return audiencePage(exec, q);
      }) as Page,
    } as unknown as MembersFacade;
    expect(await campaignFanout({ db, members: expiring, pageSize: 100 })).toEqual({
      campaigns: 0,
      pages: 2,
      inserted: 200,
      capped: 0,
    });
    expect(await count(sql`SELECT count(*)::int AS n FROM notifications.notifications WHERE status = 'pending'`)).toBe(
      0,
    );
    expect(
      await count(sql`SELECT count(*)::int AS n FROM notifications.notifications
                      WHERE status = 'suppressed' AND last_error = 'offer_expired'`),
    ).toBe(200);
    expect(await campaignOf(offerId)).toEqual({ status: "done", last_member_id: mid(200), finished: true });
  });

  it("a campaign closed right after its claim does not stop the next one", async () => {
    await seedMembers(300);
    const closedOffer = crypto.randomUUID();
    const liveOffer = crypto.randomUUID();
    await deliver(broadcast(closedOffer), "909");
    await deliver(broadcast(liveOffer), "910");
    let calls = 0;
    const withdrawing = {
      audiencePage: (async (exec, q) => {
        calls += 1;
        if (calls === 1) await withdraw(closedOffer); // claimed (oldest first), not one page written yet
        return audiencePage(exec, q);
      }) as Page,
    } as unknown as MembersFacade;
    expect(await campaignFanout({ db, members: withdrawing, pageSize: 100 })).toEqual({
      campaigns: 1,
      pages: 3,
      inserted: 300,
      capped: 0,
    });
    expect(
      await count(
        sql`SELECT count(*)::int AS n FROM notifications.notifications WHERE offer_id = ${closedOffer}::uuid`,
      ),
    ).toBe(0);
    expect(await campaignOf(liveOffer)).toMatchObject({ status: "done", finished: true });
  });
});
