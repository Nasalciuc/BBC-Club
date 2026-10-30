/** #114: a campaign page reads its members' clocks in one statement over the page's zones — the send time, its local
 *  day and that day's bounds — and the daily cap compares the pushes it finds with those bounds, without another
 *  statement. Two more round trips a page made 20 000 members fan out past 10 s on a busy Postgres. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { AudienceMember, MembersFacade } from "@bbc/members";
import { campaignFanout } from "../../src/application/campaign-fanout";
import { onOfferPublished } from "../../src/handlers/on-offer-published";

const log: string[] = [];
let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("notif-fanout-statements", { max: 2, logger: { logQuery: (q) => log.push(q) } });
});
afterAll(() => iso.drop());

const members = {
  audiencePage: async (_exec: unknown, q: { after: string | null; limit: number }) =>
    (
      (await iso.db.execute(sql`
        SELECT member_id, timezone FROM members.profile
        WHERE status = 'active' AND (${q.after}::text IS NULL OR member_id > ${q.after})
        ORDER BY member_id LIMIT ${q.limit}`)) as unknown as { member_id: string; timezone: string }[]
    ).map((r): AudienceMember => ({ memberId: r.member_id, timezone: r.timezone })),
} as unknown as MembersFacade;

describe("a campaign page's clocks", () => {
  it("one statement a page reads them, however many of its members the cap finds a push for", async () => {
    // 300 members, two zones; the first 100 already have an offer push on the day this one would go out.
    await iso.db.execute(sql`
      INSERT INTO members.profile (member_id, status, timezone)
      SELECT 'fs-' || lpad(g::text, 4, '0'), 'active', CASE WHEN g % 2 = 0 THEN 'Europe/London' ELSE 'Asia/Tokyo' END
      FROM generate_series(1, 300) g`);
    // 22:30 UTC on 28 Sep: 23:30 in London (08:00 BST on the 29th, 07:00 UTC), 07:30 in Tokyo (08:00 JST, 23:00 UTC).
    await iso.db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, scheduled_for)
      SELECT 'fs-' || lpad(g::text, 4, '0'), 'offers_personal', 'Earlier today', 'pending',
             CASE WHEN g % 2 = 0 THEN timestamptz '2026-09-29T12:00:00Z' ELSE timestamptz '2026-09-28T23:30:00Z' END
      FROM generate_series(1, 100) g`);
    await iso.db.transaction(async (tx) => {
      await onOfferPublished(
        { tx, members, sourceEventId: "fs-1" },
        {
          type: "offer.published",
          version: 1,
          offerId: crypto.randomUUID(),
          targeting: "broadcast",
          targetMemberId: null,
          routeFrom: "JFK",
          routeTo: "LHR",
          cabin: "business",
          title: "Autumn in London",
          validUntil: "2027-12-31T23:59:59.000Z",
          publishedAt: "2026-09-28T09:00:00.000Z",
        },
      );
    });

    log.length = 0;
    const m = await campaignFanout({
      db: iso.db,
      members,
      pageSize: 100,
      now: () => new Date("2026-09-28T22:30:00.000Z"),
    });
    expect(m).toEqual({ campaigns: 1, pages: 3, inserted: 200, capped: 100 });
    // The clocks: one statement a page, and only those read a zone.
    expect(log.filter((q) => /at time zone/i.test(q))).toHaveLength(3);
  });
});
