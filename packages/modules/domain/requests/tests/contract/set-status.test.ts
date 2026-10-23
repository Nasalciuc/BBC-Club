/** A request's status only moves forward, and one move is written and published once — however many webhooks or
 *  clicks race for it. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { Executor } from "@bbc/db";
import { createRequestsRepo } from "../../src/infrastructure/requests.repo";
import { setStatus } from "../../src/application/set-status";
import { onMemberDeleted } from "../../src/handlers/on-member-deleted";

let iso: IsolatedDb;
let db: Executor;
beforeAll(async () => {
  iso = await isolatedDb("requests-set-status", { max: 8 });
  db = iso.db as unknown as Executor;
});
afterAll(() => iso.drop());

async function insert(memberId: string): Promise<string> {
  const [created] = (await db.execute(sql`
    INSERT INTO requests.requests (reference, member_id, idempotency_key, trip_type, cabin, legs, passengers,
      contact_name, contact_phone, contact_email, source)
    VALUES (${`R-${crypto.randomUUID().slice(0, 8)}`}, ${memberId}, ${`idem-${crypto.randomUUID()}`}, 'oneway',
      'business', '[{"from":"JFK","to":"LHR","date":"2027-10-12"}]'::jsonb, '{"adult":1,"child":0,"infant":0}'::jsonb,
      'Alex Morgan', '+12125550148', 'alex@test.dev', 'ios')
    RETURNING id`)) as unknown as { id: string }[];
  if (!created) throw new Error("insert failed");
  return created.id;
}

/** `holdMs`: the publish takes this long, so the first transaction still holds its write while the others read. */
function deps(holdMs = 0) {
  const published: { from: unknown; to: unknown }[] = [];
  return {
    published,
    deps: {
      repo: createRequestsRepo(db),
      publish: async (_tx: Executor, e: { payload: unknown }) => {
        const p = e.payload as { from: unknown; to: unknown };
        published.push({ from: p.from, to: p.to });
        if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
      },
    },
  };
}

async function state(id: string) {
  const [row] = (await db.execute(sql`SELECT status FROM requests.requests WHERE id = ${id}`)) as unknown as {
    status: string;
  }[];
  const events = (await db.execute(
    sql`SELECT status FROM requests.request_events WHERE request_id = ${id} ORDER BY created_at, id`,
  )) as unknown as { status: string }[];
  return { status: row?.status, timeline: events.map((e) => e.status) };
}

describe("setStatus — forward only", () => {
  it("quoted → booked → quoted: the last is refused, the request stays booked and its timeline unchanged", async () => {
    const id = await insert(`mem-${crypto.randomUUID()}`);
    const { deps: d, published } = deps();
    expect(await setStatus(db, { requestId: id, status: "quoted" }, d)).toEqual({ ok: true, unchanged: false });
    expect(await setStatus(db, { requestId: id, status: "booked" }, d)).toEqual({ ok: true, unchanged: false });
    const stale = await setStatus(db, { requestId: id, status: "quoted", agentId: "ops" }, d);
    expect(stale).toEqual({ ok: false, code: "CONFLICT", from: "booked", to: "quoted" });
    expect(await state(id)).toEqual({ status: "booked", timeline: ["quoted", "booked"] });
    expect(published).toEqual([
      { from: "received", to: "quoted" },
      { from: "quoted", to: "booked" },
    ]);
    // The same status again is no move, and no refusal either.
    expect(await setStatus(db, { requestId: id, status: "booked" }, d)).toEqual({ ok: true, unchanged: true });
    // Closing is the one step left; after it, nothing.
    expect(await setStatus(db, { requestId: id, status: "closed" }, d)).toEqual({ ok: true, unchanged: false });
    for (const status of ["received", "assigned", "quoted", "booked"] as const) {
      expect(await setStatus(db, { requestId: id, status }, d)).toEqual({
        ok: false,
        code: "CONFLICT",
        from: "closed",
        to: status,
      });
    }
    expect((await state(id)).timeline).toEqual(["quoted", "booked", "closed"]);
  });

  it("each step the table allows, and none it does not", async () => {
    const allowed: Record<string, string[]> = {
      received: ["assigned", "quoted", "booked", "closed"],
      assigned: ["quoted", "booked", "closed"],
      quoted: ["booked", "closed"],
      booked: ["closed"],
      closed: [],
    };
    const all = ["received", "assigned", "quoted", "booked", "closed"] as const;
    for (const from of all) {
      for (const to of all) {
        if (from === to) continue;
        const id = await insert(`mem-${crypto.randomUUID()}`);
        await db.execute(sql`UPDATE requests.requests SET status = ${from}::requests.request_status WHERE id = ${id}`);
        const r = await setStatus(db, { requestId: id, status: to }, deps().deps);
        expect([from, to, r.ok]).toEqual([from, to, allowed[from]!.includes(to)]);
      }
    }
  });

  it("a request closed by Delete account is never reopened by a Booked link", async () => {
    const memberId = `mem-${crypto.randomUUID()}`;
    const id = await insert(memberId);
    await (iso.db as unknown as { transaction: (fn: (tx: Executor) => Promise<void>) => Promise<void> }).transaction(
      (tx) => onMemberDeleted({ tx, memberId }),
    );
    const { deps: d, published } = deps();
    const r = await setStatus(db, { requestId: id, status: "booked", agentId: "ops" }, d);
    expect(r).toEqual({ ok: false, code: "CONFLICT", from: "closed", to: "booked" });
    expect(await state(id)).toEqual({ status: "closed", timeline: ["closed"] });
    expect(published).toEqual([]);
  });

  it("four concurrent 'quoted' webhooks: one status_changed, one timeline entry", async () => {
    const id = await insert(`mem-${crypto.randomUUID()}`);
    const { deps: d, published } = deps(100);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => setStatus(db, { requestId: id, status: "quoted" }, d)),
    );
    expect(results.filter((r) => r.ok && !r.unchanged)).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.unchanged)).toHaveLength(3);
    expect(published).toEqual([{ from: "received", to: "quoted" }]);
    expect(await state(id)).toEqual({ status: "quoted", timeline: ["quoted"] });
  });
});
