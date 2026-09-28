/** audiencePage: campaign fan-out pages through active members by keyset, never loading every id. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createMembersFacade } from "../../src/application/facade";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("members-audience", { max: 2 });
  db = iso.db;
});
afterAll(async () => {
  await iso.drop();
});

const id = (n: number) => `aud-${String(n).padStart(5, "0")}`;

describe("audiencePage", () => {
  it("2 500 active members, limit 1 000 → 1000 / 1000 / 500 / [] ; opted-out and inactive never appear", async () => {
    // 2 502 active (2 opt out of broadcast → 2 500 eligible), 30 waitlisted, 1 deleted — the page must only ever see active members.
    await db.execute(sql`
      INSERT INTO members.profile (member_id, status, timezone)
      SELECT 'aud-' || lpad(g::text, 5, '0'), 'active', 'Europe/London' FROM generate_series(1, 2502) g`);
    await db.execute(sql`
      INSERT INTO members.profile (member_id, status)
      SELECT 'aud-w' || lpad(g::text, 4, '0'), 'waitlist' FROM generate_series(1, 30) g`);
    await db.execute(sql`
      INSERT INTO members.profile (member_id, status, deleted_at) VALUES ('aud-x0001', 'deleted', now())`);
    // Two opt-outs of broadcast; one opt-out of the other category must not hide the member.
    await db.execute(sql`
      INSERT INTO members.notification_preferences (member_id, category, enabled) VALUES
        (${id(7)}, 'offers_broadcast', false),
        (${id(1500)}, 'offers_broadcast', false),
        (${id(9)}, 'offers_personal', false),
        (${id(10)}, 'offers_broadcast', true)`);

    const facade = createMembersFacade(db);
    const pages: string[][] = [];
    let after: string | null = null;
    for (;;) {
      const page = await facade.audiencePage(undefined, { category: "offers_broadcast", after, limit: 1_000 });
      pages.push(page.map((p) => p.memberId));
      const last = page.at(-1);
      if (!last) break;
      expect(page.every((p) => p.timezone === "Europe/London")).toBe(true);
      after = last.memberId;
    }

    expect(pages.map((p) => p.length)).toEqual([1_000, 1_000, 500, 0]);
    const all = pages.flat();
    expect(new Set(all).size).toBe(all.length); // no member twice across pages
    expect(all).toEqual([...all].sort()); // keyset order
    expect(all).not.toContain(id(7));
    expect(all).not.toContain(id(1500));
    expect(all).toContain(id(9)); // opted out of personal offers only
    expect(all).toContain(id(10)); // an explicit "enabled" row
    expect(all.some((m) => m.startsWith("aud-w") || m === "aud-x0001")).toBe(false);

    const personal = await facade.audiencePage(undefined, { category: "offers_personal", after: null, limit: 5_000 });
    expect(personal).toHaveLength(2_501);
    expect(personal.map((p) => p.memberId)).not.toContain(id(9));
  });
});
