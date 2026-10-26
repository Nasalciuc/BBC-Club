/** The old path is gone: a broadcast delivery never touches the member list. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { MembersFacade } from "@bbc/members";
import { onOfferPublished } from "../../src/handlers/on-offer-published";
import { isInQuietHours } from "../../src/application/quiet-hours";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("notif-offer-published", { max: 2 });
});
afterAll(() => iso.drop());

/** Every facade call fails the test: the broadcast path must not ask about any member. */
const untouchable = new Proxy({} as MembersFacade, {
  get: (_t, name) => () => {
    throw new Error(`broadcast delivery called members.${String(name)}`);
  },
});

describe("onOfferPublished — broadcast", () => {
  it("writes one campaign and zero notifications without a single members call", async () => {
    await iso.db.execute(sql`
      INSERT INTO members.profile (member_id, status)
      SELECT 'op-' || g, 'active' FROM generate_series(1, 200) g`);
    const offerId = crypto.randomUUID();
    await iso.db.transaction(async (tx) => {
      await onOfferPublished(
        { tx, members: untouchable, sourceEventId: "777" },
        {
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
        },
      );
    });
    const [c] = (await iso.db.execute(
      sql`SELECT count(*)::int AS n FROM notifications.campaigns WHERE offer_id = ${offerId}::uuid`,
    )) as unknown as { n: number }[];
    const [n] = (await iso.db.execute(
      sql`SELECT count(*)::int AS n FROM notifications.notifications WHERE offer_id = ${offerId}::uuid`,
    )) as unknown as { n: number }[];
    expect(c?.n).toBe(1);
    expect(n?.n).toBe(0);
  });

  it("no code in the notifications module loads every active member id", () => {
    const src = join(import.meta.dir, "../../src");
    const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
    const hits = files.filter((f) => readFileSync(join(src, f), "utf8").includes("activeMemberIds"));
    expect(hits).toEqual([]);
  });
});

describe("onOfferPublished — personal", () => {
  it("a member whose stored time zone is not one still gets the offer, scheduled by the club's default", async () => {
    const memberId = `tz-bad-${crypto.randomUUID()}`;
    const offerId = crypto.randomUUID();
    const warned: object[] = [];
    const facade = {
      getStatus: async () => "active",
      preferencesOf: async () => ({ offers_personal: true, offers_broadcast: true }),
      timezoneOf: async () => "Not/AZone",
    } as unknown as MembersFacade;
    await iso.db.transaction(async (tx) => {
      await onOfferPublished(
        { tx, members: facade, sourceEventId: "778", logger: { warn: (o: object) => warned.push(o) } },
        {
          type: "offer.published",
          version: 1,
          offerId,
          targeting: "user",
          targetMemberId: memberId,
          routeFrom: "JFK",
          routeTo: "LHR",
          cabin: "business",
          title: "Your October in London",
          validUntil: "2027-12-31T23:59:59.000Z",
          publishedAt: "2026-09-28T09:00:00.000Z",
        },
      );
    });
    const [n] = (await iso.db.execute(
      sql`SELECT count(*)::int AS n FROM notifications.notifications
          WHERE offer_id = ${offerId}::uuid AND member_id = ${memberId}`,
    )) as unknown as { n: number }[];
    expect(n?.n).toBe(1);
    expect(warned).toContainEqual(expect.objectContaining({ memberId, reason: "invalid_time_zone" }));
  });
});

describe("onOfferPublished — published for later", () => {
  it("a personal offer published in two hours is pushed then, never while it is still invisible", async () => {
    const memberId = `later-${crypto.randomUUID()}`;
    const offerId = crypto.randomUUID();
    const publishedAt = new Date(Date.now() + 2 * 3_600_000);
    // A zone outside quiet hours right now (one of these always is), so only publishedAt can move the push later.
    const awake = ["Europe/London", "Asia/Tokyo", "America/Los_Angeles"].find((tz) => !isInQuietHours(new Date(), tz));
    const facade = {
      getStatus: async () => "active",
      preferencesOf: async () => ({ offers_personal: true, offers_broadcast: true }),
      timezoneOf: async () => awake,
    } as unknown as MembersFacade;
    await iso.db.transaction(async (tx) => {
      await onOfferPublished(
        { tx, members: facade, sourceEventId: "779" },
        {
          type: "offer.published",
          version: 1,
          offerId,
          targeting: "user",
          targetMemberId: memberId,
          routeFrom: "JFK",
          routeTo: "LHR",
          cabin: "business",
          title: "Your October in London",
          validUntil: "2027-12-31T23:59:59.000Z",
          publishedAt: publishedAt.toISOString(),
        },
      );
    });
    const [row] = (await iso.db.execute(
      sql`SELECT scheduled_for FROM notifications.notifications WHERE offer_id = ${offerId}::uuid`,
    )) as unknown as { scheduled_for: string }[];
    expect(row).toBeDefined();
    expect(new Date(row!.scheduled_for).getTime()).toBeGreaterThanOrEqual(publishedAt.getTime());
  });
});

/** At most one offer push per member per day — the day it is sent, in the member's zone (4.1.10), whatever day the
 *  earlier push was created on. */
describe("onOfferPublished — the daily cap counts the day of sending", () => {
  const facadeIn = (timezone: string) =>
    ({
      getStatus: async () => "active",
      preferencesOf: async () => ({ offers_personal: true, offers_broadcast: true }),
      timezoneOf: async () => timezone,
    }) as unknown as MembersFacade;
  const publish = (memberId: string, offerId: string, publishedAt: string, now: Date, timezone: string) =>
    iso.db.transaction(async (tx) => {
      await onOfferPublished(
        { tx, members: facadeIn(timezone), sourceEventId: `cap-${offerId}`, now: () => now },
        {
          type: "offer.published",
          version: 1,
          offerId,
          targeting: "user",
          targetMemberId: memberId,
          routeFrom: "JFK",
          routeTo: "LHR",
          cabin: "business",
          title: "Your October in London",
          validUntil: "2027-12-31T23:59:59.000Z",
          publishedAt,
        },
      );
    });
  const pushed = (memberId: string, scheduledFor: string, createdAt?: string) =>
    iso.db.execute(sql`
      INSERT INTO notifications.notifications (member_id, category, title, status, offer_id, scheduled_for, created_at)
      VALUES (${memberId}, 'offers_broadcast', 'an earlier offer', 'sent', gen_random_uuid(),
              ${scheduledFor}::timestamptz, coalesce(${createdAt ?? null}::timestamptz, now()))`);
  const written = async (offerId: string) =>
    (
      (await iso.db.execute(
        sql`SELECT scheduled_for FROM notifications.notifications WHERE offer_id = ${offerId}::uuid`,
      )) as unknown as { scheduled_for: string }[]
    ).map((r) => new Date(r.scheduled_for).toISOString());

  it("capped by a push sent the same local day, created the evening before", async () => {
    const memberId = `cap-london-${crypto.randomUUID()}`;
    // Created at 23:10 on the 25th, moved past quiet hours to 08:00 on the 26th in London.
    await pushed(memberId, "2026-10-26T08:00:00.000Z", "2026-10-25T23:10:00.000Z");
    const offerId = crypto.randomUUID();
    const noon = new Date("2026-10-26T12:00:00.000Z"); // 12:00 in London, sent at once
    await publish(memberId, offerId, "2026-10-26T11:00:00.000Z", noon, "Europe/London");
    expect(await written(offerId)).toEqual([]);
  });

  it("not capped by one created today but sent on another local day", async () => {
    const memberId = `cap-tokyo-${crypto.randomUUID()}`;
    // Created now, in the database's clock, but sent at 08:00 on the 27th in Tokyo.
    await pushed(memberId, "2026-10-26T23:00:00.000Z");
    const offerId = crypto.randomUUID();
    const at = new Date("2026-10-26T00:30:00.000Z"); // 09:30 on the 26th in Tokyo, sent at once
    await publish(memberId, offerId, "2026-10-26T00:00:00.000Z", at, "Asia/Tokyo");
    expect(await written(offerId)).toEqual([at.toISOString()]);
  });

  it("an offer published for later is counted on the day it is sent, not the day it arrives", async () => {
    const memberId = `cap-later-${crypto.randomUUID()}`;
    await pushed(memberId, "2026-10-26T09:00:00.000Z"); // today's push, 09:00 in London on the 26th
    await pushed(memberId, "2026-10-28T09:00:00.000Z"); // one already going at 09:00 on the 28th
    const noon = new Date("2026-10-26T12:00:00.000Z");
    // Published at 10:00 on the 28th: the 28th already has its push.
    const capped = crypto.randomUUID();
    await publish(memberId, capped, "2026-10-28T10:00:00.000Z", noon, "Europe/London");
    expect(await written(capped)).toEqual([]);
    // Published at 10:00 on the 27th: a day with none, though today has one.
    const sent = crypto.randomUUID();
    await publish(memberId, sent, "2026-10-27T10:00:00.000Z", noon, "Europe/London");
    expect(await written(sent)).toEqual(["2026-10-27T10:00:00.000Z"]);
  });
});
