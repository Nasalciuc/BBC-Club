/** ADR-IMPL-042: the member's list keeps requests in progress first; the send job never stops on one bad row and,
 *  when it gives up on a request, says so once — logged, counted, posted to the ops channel. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { Executor } from "@bbc/db";
import { MAX_SEND_ATTEMPTS, createRequestsRepo } from "../../src/infrastructure/requests.repo";
import { createSendRequestsJob } from "../../src/jobs/send-requests";

let iso: IsolatedDb;
let db: Executor;
beforeAll(async () => {
  iso = await isolatedDb("requests-list-and-send", { max: 4 });
  db = iso.db as unknown as Executor;
});
afterAll(() => iso.drop());

async function insert(row: {
  ref: string;
  member: string;
  status?: string;
  createdAt: string;
  passengers?: string;
}): Promise<string> {
  const [created] = (await db.execute(sql`
    INSERT INTO requests.requests (reference, member_id, idempotency_key, trip_type, cabin, legs, passengers,
      contact_name, contact_phone, contact_email, source, status, created_at)
    VALUES (${row.ref}, ${row.member}, ${`idem-${row.ref}`}, 'oneway', 'business',
      '[{"from":"JFK","to":"LHR","date":"2027-10-12"}]'::jsonb,
      ${row.passengers ?? '{"adult":1,"child":0,"infant":0}'}::jsonb,
      'Alex Morgan', '+12125550148', 'alex@test.dev', 'ios', ${row.status ?? "received"}::requests.request_status,
      ${row.createdAt}::timestamptz)
    RETURNING id`)) as unknown as { id: string }[];
  if (!created) throw new Error("insert failed");
  return created.id;
}

describe("the member's list — in progress first", () => {
  it("an older request in progress comes before a newer finished one; newest first within each group", async () => {
    const member = `mem-${crypto.randomUUID()}`;
    const received = await insert({ ref: "R-L1", member, status: "received", createdAt: "2026-01-01T00:00:00Z" });
    const booked = await insert({ ref: "R-L2", member, status: "booked", createdAt: "2026-01-05T00:00:00Z" });
    const quoted = await insert({ ref: "R-L3", member, status: "quoted", createdAt: "2026-01-03T00:00:00Z" });
    const closed = await insert({ ref: "R-L4", member, status: "closed", createdAt: "2026-01-06T00:00:00Z" });
    const rows = await createRequestsRepo(db).listForMember(undefined, member);
    expect(rows.map((r) => r.id)).toEqual([quoted, received, closed, booked]);
  });
});

describe("send-requests — one bad row never stops the batch; giving up is said once", () => {
  it("a row that does not read and a CRM that keeps failing: attempts counted, then one alert each", async () => {
    const member = `mem-${crypto.randomUUID()}`;
    // `passengers` without `adult` cannot be read as a request (ClaimedRow).
    const bad = await insert({ ref: "R-S1", member, createdAt: "2026-01-01T00:00:00Z", passengers: '{"child":0}' });
    const failing = await insert({ ref: "R-S2", member, createdAt: "2026-01-01T00:01:00Z" });
    const good = await insert({ ref: "R-S3", member, createdAt: "2026-01-01T00:02:00Z" });

    const sent: string[] = [];
    const posted: string[] = [];
    const errors: object[] = [];
    const counted: string[] = [];
    const job = createSendRequestsJob({
      db,
      repo: createRequestsRepo(db),
      crm: {
        async submitRequest(payload: unknown) {
          const p = payload as { reference: string; _request_id: string };
          if (p.reference === "R-S2") throw new Error("CRM unavailable");
          sent.push(p._request_id);
          return { crmRequestId: `crm-${p.reference}` };
        },
      },
      logger: { warn: () => undefined, error: (o: object) => errors.push(o) },
      metrics: { inc: (name: string) => counted.push(name) },
      notifyOps: async (text: string) => {
        posted.push(text);
      },
      appOrigin: "http://localhost:8000",
      opsLinkSecret: "s".repeat(32),
    });

    for (let run = 0; run < MAX_SEND_ATTEMPTS + 2; run++) {
      // A failed request waits five minutes before the next try: move the clock instead of waiting.
      await db.execute(
        sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id IN (${bad}, ${failing})`,
      );
      await job();
    }

    // (The list's rows above are unsent too, and go; only this test's three are looked at.)
    expect(sent.filter((id) => id === bad || id === failing || id === good)).toEqual([good]);
    const rows = (await db.execute(
      sql`SELECT id, send_attempts::int AS attempts, last_error FROM requests.requests WHERE id IN (${bad}, ${failing})`,
    )) as unknown as { id: string; attempts: number; last_error: string }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(bad)?.attempts).toBe(MAX_SEND_ATTEMPTS);
    expect(byId.get(bad)?.last_error).toStartWith("row shape: passengers.adult");
    expect(byId.get(failing)?.attempts).toBe(MAX_SEND_ATTEMPTS);
    // Once each, however many runs follow — and never the member's details in the alert.
    expect(posted).toHaveLength(2);
    expect(posted.some((t) => t.includes("R-S2"))).toBe(true);
    expect(posted.join(" ")).not.toContain("alex@test.dev");
    expect(counted.filter((n) => n === "request_sends_given_up")).toHaveLength(2);
    expect(errors).toHaveLength(2);
  }, 60_000);
});
