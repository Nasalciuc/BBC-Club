/** The old path is gone: a broadcast delivery never touches the member list. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { MembersFacade } from "@bbc/members";
import { onOfferPublished } from "../../src/handlers/on-offer-published";

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
