/** send-requests: what the job stores, logs and hands the CRM for one request. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { Executor } from "@bbc/db";
import { createRequestsRepo } from "../../src/infrastructure/requests.repo";
import { createSendRequestsJob } from "../../src/jobs/send-requests";

let iso: IsolatedDb;
let db: Executor;
beforeAll(async () => {
  iso = await isolatedDb("requests-send", { max: 4 });
  db = iso.db as unknown as Executor;
});
afterAll(() => iso.drop());

async function insert(ref: string): Promise<string> {
  const [created] = (await db.execute(sql`
    INSERT INTO requests.requests (reference, member_id, idempotency_key, trip_type, cabin, legs, passengers,
      contact_name, contact_phone, contact_email, source, status)
    VALUES (${ref}, ${`mem-${crypto.randomUUID()}`}, ${`idem-${ref}-${crypto.randomUUID()}`}, 'oneway', 'business',
      '[{"from":"JFK","to":"LHR","date":"2027-10-12"}]'::jsonb, '{"adult":1,"child":0,"infant":0}'::jsonb,
      'Alex Morgan', '+12125550148', 'alex@test.dev', 'ios', 'received')
    RETURNING id`)) as unknown as { id: string }[];
  if (!created) throw new Error("insert failed");
  return created.id;
}

/** Only this test's row: other tests' unsent rows are closed, and a closed request is never sent. */
async function only(id: string) {
  await db.execute(sql`UPDATE requests.requests SET status = 'closed' WHERE id <> ${id} AND sent_to_crm = false`);
}

function job(crm: { submitRequest(payload: unknown): Promise<{ crmRequestId: string }> }, warned: object[] = []) {
  return createSendRequestsJob({
    db,
    repo: createRequestsRepo(db),
    crm,
    logger: { warn: (o: object) => warned.push(o), error: (o: object) => warned.push(o) },
    metrics: { inc: () => undefined },
    notifyOps: async () => undefined,
    appOrigin: "http://localhost:8000",
    opsLinkSecret: "s".repeat(32),
  });
}

describe("send-requests — a failed send never stores or logs a failed query's parameters (AGENTS.md rule 6)", () => {
  it("a query error carrying a token: last_error and the log line keep its SQLSTATE, not the token", async () => {
    const SECRET = "sess_not-a-real-token-0123456789";
    const id = await insert("R-LOG1");
    await only(id);
    const warned: object[] = [];
    const run = job(
      {
        async submitRequest() {
          // What Drizzle throws: the parameters in the message and on the error itself.
          throw Object.assign(new Error(`Failed query: insert into t values ($1)\nparams: ${SECRET}`), {
            name: "DrizzleQueryError",
            query: "insert into t values ($1)",
            params: [SECRET],
            cause: { code: "23505", table_name: "t" },
          });
        },
      },
      warned,
    );
    await run();
    const [row] = (await db.execute(
      sql`SELECT last_error, send_attempts::int AS attempts FROM requests.requests WHERE id = ${id}`,
    )) as unknown as { last_error: string; attempts: number }[];
    expect(row?.attempts).toBe(1);
    expect(row?.last_error).not.toContain(SECRET);
    expect(row?.last_error).toContain("23505");
    expect(JSON.stringify(warned)).not.toContain(SECRET);
    expect(warned.length).toBeGreaterThan(0);
  });
});

describe("send-requests — a resend says which try it is", () => {
  it("a CRM that timed out once (the mail may have gone): the next run's payload has _attempt 2", async () => {
    const id = await insert("R-RESEND");
    await only(id);
    const attempts: unknown[] = [];
    let calls = 0;
    const run = job({
      async submitRequest(payload: unknown) {
        attempts.push((payload as { _attempt?: unknown })._attempt);
        if (++calls === 1) throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
        return { crmRequestId: "crm-resend" };
      },
    });
    await run();
    // Five minutes on: the retry.
    await db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
    await run();
    expect(attempts).toEqual([1, 2]);
    const [row] = (await db.execute(sql`SELECT sent_to_crm FROM requests.requests WHERE id = ${id}`)) as unknown as {
      sent_to_crm: boolean;
    }[];
    expect(row?.sent_to_crm).toBe(true);
  });
});

describe("send-requests — a CRM refusal is given up at once; anything else is tried again (ADR-IMPL-065)", () => {
  /** What @bbc/crm throws: an error that says whether sending again can help. */
  const crmError = (status: number, retryable: boolean) =>
    Object.assign(new Error(`CRM submitRequest answered ${status} (${retryable ? "retryable" : "permanent"})`), {
      name: "CrmHttpError",
      code: "CRM_HTTP",
      retryable,
      status,
    });

  async function state(id: string) {
    const [row] = (await db.execute(
      sql`SELECT sent_to_crm, send_attempts::int AS attempts, last_error FROM requests.requests WHERE id = ${id}`,
    )) as unknown as { sent_to_crm: boolean; attempts: number; last_error: string | null }[];
    return row;
  }

  function jobWith(crm: { submitRequest(payload: unknown): Promise<{ crmRequestId: string }> }) {
    const posted: string[] = [];
    const logged: object[] = [];
    const run = createSendRequestsJob({
      db,
      repo: createRequestsRepo(db),
      crm,
      logger: { warn: (o: object) => logged.push(o), error: (o: object) => logged.push(o) },
      metrics: { inc: () => undefined },
      notifyOps: async (text) => {
        posted.push(text);
      },
      appOrigin: "http://localhost:8000",
      opsLinkSecret: "s".repeat(32),
    });
    return { run, posted, logged };
  }

  it("a 400: one attempt, given up — the member reads not_sent, ops are told, nothing resends it", async () => {
    const id = await insert("R-REFUSED");
    await only(id);
    let calls = 0;
    const { run, posted } = jobWith({
      async submitRequest() {
        calls++;
        throw crmError(400, false);
      },
    });
    await run();
    const row = await state(id);
    expect(row?.sent_to_crm).toBe(false);
    expect(row?.attempts).toBe(6);
    expect(row?.last_error).toBe("CrmHttpError: CRM submitRequest answered 400 (permanent)");
    expect(posted).toEqual([
      "request R-REFUSED was refused by the CRM (the log says why) — fix the cause, then re-queue it (RUNBOOK)",
    ]);
    // Past the retry delay, the job does not claim it again.
    await db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
    await run();
    expect(calls).toBe(1);
    // The operator's re-queue (RUNBOOK) sends it again once the cause is fixed.
    await db.execute(sql`UPDATE requests.requests SET send_attempts = 0, sent_at = NULL WHERE id = ${id}`);
    const fixed = jobWith({ submitRequest: async () => ({ crmRequestId: "http:R-REFUSED" }) });
    await fixed.run();
    expect((await state(id))?.sent_to_crm).toBe(true);
  });

  it("a 503, a 429, a timeout: one failed attempt each, tried again later — never given up early", async () => {
    for (const [ref, err] of [
      ["R-RETRY-503", crmError(503, true)],
      ["R-RETRY-429", crmError(429, true)],
      ["R-RETRY-TIMEOUT", Object.assign(new Error("CRM submitRequest timed out after 5000ms"), { retryable: true })],
      ["R-RETRY-PLAIN", new Error("Postmark 503")],
    ] as const) {
      const id = await insert(ref);
      await only(id);
      const { run, posted } = jobWith({
        async submitRequest() {
          throw err;
        },
      });
      await run();
      const row = await state(id);
      expect(row?.attempts).toBe(1);
      expect(row?.sent_to_crm).toBe(false);
      expect(posted).toEqual([]);
    }
  });
});
