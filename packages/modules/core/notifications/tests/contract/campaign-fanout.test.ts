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

async function deliver(payload: unknown, sourceEventId: string, facade: MembersFacade = members) {
  await db.transaction(async (tx) => {
    await onOfferPublished({ tx, members: facade, sourceEventId }, payload);
  });
}

/** Fails the test if anything on it is called. Symbols and `then` stay undefined, so inspection and `await` never trip it. */
const noMembers = new Proxy({} as MembersFacade, {
  get: (_t, name) =>
    typeof name === "symbol" || name === "then"
      ? undefined
      : () => {
          throw new Error(`members.${name} was called`);
        },
});

const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0]?.n);
const notificationCount = () => count(sql`SELECT count(*)::int AS n FROM notifications.notifications`);

function run(extra: Partial<CampaignFanoutDeps> = {}) {
  return campaignFanout({ db, members, ...extra });
}

describe("broadcast delivery", () => {
  it("writes exactly one campaign and zero notifications, without reading the audience", async () => {
    await seedMembers(5_000);
    await deliver(broadcast(), "101", noMembers);
    expect(await count(sql`SELECT count(*)::int AS n FROM notifications.campaigns`)).toBe(1);
    expect(await notificationCount()).toBe(0);
    const [c] = (await db.execute(sql`SELECT status, category, body, deep_link FROM notifications.campaigns`)) as any[];
    expect(c).toMatchObject({ status: "pending", category: "offers_broadcast", body: "JFK → LHR" });
  });

  it("the facade reaches the handler: a personal offer trips it", async () => {
    const personal = { ...broadcast(), targeting: "user", targetMemberId: crypto.randomUUID() };
    await expect(deliver(personal, "102", noMembers)).rejects.toThrow("members.getStatus was called");
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
    // Already an offer push on the day this one goes out (in the member's zone) → capped. An older one does not cap.
    const noon = new Date("2026-10-26T12:00:00.000Z"); // 12:00 in London: no quiet hours, sent at once
    await db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id, scheduled_for, created_at)
      VALUES (${mid(5)}, 'offers_personal', 'earlier today', 'pending', gen_random_uuid(),
              ${new Date(noon.getTime() - 2 * 3_600_000).toISOString()}::timestamptz,
              ${new Date(noon.getTime() - 2 * 3_600_000).toISOString()}::timestamptz)`);
    await db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id, scheduled_for, created_at)
      VALUES (${mid(6)}, 'offers_personal', 'last week', 'pending', gen_random_uuid(),
              ${new Date(noon.getTime() - 7 * 86_400_000).toISOString()}::timestamptz,
              ${new Date(noon.getTime() - 7 * 86_400_000).toISOString()}::timestamptz)`);
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "303");

    const m = await run({ pageSize: 100, now: () => noon });
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
    expect(c.last_member_id).toBeNull(); // the cursor goes with the work: no member id stays behind
    expect(c.finished_at).not.toBeNull();

    expect(await run({ pageSize: 100, now: () => noon })).toEqual({ campaigns: 0, pages: 0, inserted: 0, capped: 0 });
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

  it("a member whose stored time zone is not one: the run completes, and their row follows the club's default", async () => {
    await db.execute(sql`
      INSERT INTO members.profile (member_id, status, timezone) VALUES
        ('tz-1-london', 'active', 'Europe/London'), ('tz-2-bad', 'active', 'Europe/London'),
        ('tz-3-tokyo', 'active', 'Asia/Tokyo')`);
    // A value stored before time zones were checked: the audience hands it on as it is.
    const withBadZone = {
      audiencePage: async (exec: unknown, q: Parameters<Page>[1]) =>
        (await audiencePage(exec as undefined, q)).map((m) =>
          m.memberId === "tz-2-bad" ? { ...m, timezone: "Not/AZone" } : m,
        ),
    } as unknown as MembersFacade;
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "405");
    const at = new Date("2026-09-28T03:00:00.000Z"); // 23:00 in New York: quiet hours there
    const warned: object[] = [];
    const m = await run({
      members: withBadZone,
      now: () => at,
      logger: { warn: (o: object) => warned.push(o) },
    });
    expect(m.campaigns).toBe(1);
    const [c] = (await db.execute(sql`SELECT status FROM notifications.campaigns`)) as any[];
    expect(c.status).toBe("done");
    const rows = (await db.execute(sql`
      SELECT member_id, scheduled_for FROM notifications.notifications WHERE offer_id = ${offerId}::uuid
      ORDER BY member_id`)) as any[];
    expect(rows.map((r) => r.member_id)).toEqual(["tz-1-london", "tz-2-bad", "tz-3-tokyo"]);
    const bad = rows.find((r) => r.member_id === "tz-2-bad");
    // The club's default zone: 23:00 in New York on 27 September (−04) waits for 08:00 there, 12:00 UTC.
    expect(new Date(bad.scheduled_for).toISOString()).toBe("2026-09-28T12:00:00.000Z");
    expect(warned).toContainEqual(expect.objectContaining({ memberId: "tz-2-bad", reason: "invalid_time_zone" }));
  });

  it("an offer published for later: its campaign is not claimed before then, and is after", async () => {
    await seedMembers(3);
    const offerId = crypto.randomUUID();
    const later = new Date(Date.now() + 2 * 3_600_000).toISOString();
    await deliver({ ...broadcast(offerId), publishedAt: later }, "406");
    const [c] = (await db.execute(sql`SELECT not_before FROM notifications.campaigns`)) as any[];
    expect(new Date(c.not_before).toISOString()).toBe(later);

    const early = await run();
    expect(early.campaigns).toBe(0);
    expect(await notificationCount()).toBe(0);
    const [waiting] = (await db.execute(sql`SELECT status FROM notifications.campaigns`)) as any[];
    expect(waiting.status).toBe("pending");

    // Two hours on: publish_at has come.
    await db.execute(sql`UPDATE notifications.campaigns SET not_before = now() - interval '1 second'`);
    const due = await run();
    expect(due).toMatchObject({ campaigns: 1, inserted: 3 });
  });

  it("a campaign waiting for its time does not hold up one that is due", async () => {
    await seedMembers(2);
    await deliver({ ...broadcast(), publishedAt: new Date(Date.now() + 3_600_000).toISOString() }, "407");
    const dueOffer = crypto.randomUUID();
    await deliver(broadcast(dueOffer), "408");
    const m = await run();
    expect(m.campaigns).toBe(1);
    expect(
      await count(sql`SELECT count(*)::int AS n FROM notifications.notifications WHERE offer_id = ${dueOffer}::uuid`),
    ).toBe(2);
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

/** At most one offer push per member per day: the day it is sent, in the member's zone (4.1.10). The cap once counted
 *  the rows created since the server's UTC midnight, while quiet hours move a push to the next morning: two pushes
 *  landed on one local evening across UTC midnight, and a push sent today was dropped for one created today but sent
 *  tomorrow. */
describe("the daily cap counts the day of sending, in the member's zone", () => {
  // 00:30 UTC on 26 Oct 2026: 20:30 on the 25th in New York (sent at once), 00:30 on the 26th in London (quiet hours:
  // sent at 08:00), 09:30 on the 26th in Tokyo (sent at once).
  const at = new Date("2026-10-26T00:30:00.000Z");
  const pushed = (memberId: string, scheduledFor: string, createdAt = scheduledFor) =>
    db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id, scheduled_for, created_at)
      VALUES (${memberId}, 'offers_personal', 'an earlier offer', 'sent', gen_random_uuid(),
              ${scheduledFor}::timestamptz, ${createdAt}::timestamptz)`);
  const profile = (memberId: string, timezone: string) =>
    db.execute(
      sql`INSERT INTO members.profile (member_id, status, timezone) VALUES (${memberId}, 'active', ${timezone})`,
    );

  it("around UTC midnight and across quiet hours, a member is capped only by a push on the same local day", async () => {
    await profile("day-1-ny-same-evening", "America/New_York");
    await profile("day-2-ny-day-before", "America/New_York");
    await profile("day-3-london-this-morning", "Europe/London");
    await profile("day-4-london-yesterday", "Europe/London");
    await profile("day-5-tokyo-tomorrow", "Asia/Tokyo");
    // 19:30 in New York on the 25th, an hour before this one, the day before in UTC: the same evening.
    await pushed("day-1-ny-same-evening", "2026-10-25T23:30:00.000Z");
    // 23:00 in New York on the 24th, though the same UTC day as the push above.
    await pushed("day-2-ny-day-before", "2026-10-25T03:00:00.000Z");
    // Created at 23:10 on the 25th and moved past quiet hours to 08:00 on the 26th — when this one goes too.
    await pushed("day-3-london-this-morning", "2026-10-26T08:00:00.000Z", "2026-10-25T23:10:00.000Z");
    // Sent at 21:00 on the 25th in London: this one goes on the 26th.
    await pushed("day-4-london-yesterday", "2026-10-25T21:00:00.000Z");
    // Created now (in the database's clock, as the old cap read it) but sent at 08:00 on the 27th in Tokyo; this one goes
    // on the 26th.
    await db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id, scheduled_for)
      VALUES ('day-5-tokyo-tomorrow', 'offers_broadcast', 'tomorrow morning', 'pending', gen_random_uuid(),
              '2026-10-26T23:00:00.000Z'::timestamptz)`);
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "460");

    const m = await run({ now: () => at });
    expect(m).toMatchObject({ campaigns: 1, inserted: 3, capped: 2 });
    const rows = (await db.execute(sql`
      SELECT member_id, scheduled_for FROM notifications.notifications WHERE offer_id = ${offerId}::uuid
      ORDER BY member_id`)) as unknown as { member_id: string; scheduled_for: string }[];
    expect(rows.map((r) => [r.member_id, new Date(r.scheduled_for).toISOString()])).toEqual([
      ["day-2-ny-day-before", at.toISOString()],
      ["day-4-london-yesterday", "2026-10-26T08:00:00.000Z"],
      ["day-5-tokyo-tomorrow", at.toISOString()],
    ]);
  });

  it("a London evening: sent at once it is capped by that morning's push; moved by quiet hours to tomorrow it is not", async () => {
    await profile("eve-london", "Europe/London");
    await pushed("eve-london", "2026-10-26T08:00:00.000Z"); // 08:00 in London on the 26th
    const first = crypto.randomUUID();
    await deliver(broadcast(first), "461");
    // 21:30 in London on the 26th: sent at once, the same day as the morning's.
    expect(await run({ now: () => new Date("2026-10-26T21:30:00.000Z") })).toMatchObject({ inserted: 0, capped: 1 });
    const second = crypto.randomUUID();
    await deliver(broadcast(second), "462");
    // 22:30: quiet hours, so it goes at 08:00 on the 27th — a day with no push yet.
    expect(await run({ now: () => new Date("2026-10-26T22:30:00.000Z") })).toMatchObject({ inserted: 1, capped: 0 });
    const [row] = (await db.execute(
      sql`SELECT scheduled_for FROM notifications.notifications WHERE offer_id = ${second}::uuid`,
    )) as unknown as { scheduled_for: string }[];
    expect(new Date(row!.scheduled_for).toISOString()).toBe("2026-10-27T08:00:00.000Z");
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
    expect(await campaignOf(offerId)).toEqual({ status: "done", last_member_id: null, finished: true });
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

describe("transaction boundaries and races", () => {
  it("a delivery that fails after recording the campaign leaves no campaign; the redelivery records one", async () => {
    const injected = new Error("injected after the campaign insert");
    const payload = broadcast();
    await db
      .transaction(async (tx) => {
        await onOfferPublished({ tx, members, sourceEventId: "1001" }, payload);
        throw injected;
      })
      .catch((e: unknown) => {
        if (e !== injected) throw e;
      });
    expect(await count(sql`SELECT count(*)::int AS n FROM notifications.campaigns`)).toBe(0);
    await deliver(payload, "1001");
    expect(await count(sql`SELECT count(*)::int AS n FROM notifications.campaigns`)).toBe(1);
  });

  it("the job started twice at once writes one set of notifications", async () => {
    await seedMembers(1_000);
    const offerId = crypto.randomUUID();
    await deliver(broadcast(offerId), "1002");
    // Both runners bypass the singleton lock on purpose: what must hold here is the data, not the scheduler.
    const [a, b] = await Promise.all([run({ pageSize: 100 }), run({ pageSize: 100 })]);
    expect(a.inserted + b.inserted).toBe(1_000);
    expect(
      await count(sql`SELECT count(*)::int AS n FROM notifications.notifications WHERE offer_id = ${offerId}::uuid`),
    ).toBe(1_000);
    expect(
      await count(sql`SELECT count(DISTINCT member_id)::int AS n FROM notifications.notifications
                      WHERE offer_id = ${offerId}::uuid`),
    ).toBe(1_000);
  });
});
