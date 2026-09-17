import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("POST /v1/requests", () => {
  it("creates a row, publishes request.submitted, CRM mock records via consumer", async () => {
    const t = await testApp({ suite: "requests-create" });
    const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(r.status).toBe(201);
    const body = (await r.json()) as { id: string; status: string; reference: string };
    expect(body.status).toBe("not_sent");
    expect(body.reference).toBe("");
    await t.drainAll();
    expect(t.crm.submitted.length).toBe(1);
    const [{ sent_to_crm, reference }]: any = await t.db.execute(
      sql`SELECT sent_to_crm, reference FROM requests.requests WHERE id = ${body.id}`,
    );
    expect(sent_to_crm).toBe(true);
    expect(reference).toMatch(/^R-/);
    const journal = await t.journal.byType("request.submitted");
    expect(journal.length).toBeGreaterThan(0);
    await t.close();
  });

  it("same Idempotency-Key returns 200 and the same id", async () => {
    const t = await testApp({ suite: "requests-idem" });
    const key = crypto.randomUUID();
    const a = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key });
    const b = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(((await a.json()) as { id: string }).id).toBe(((await b.json()) as { id: string }).id);
    const [{ n }]: any = await t.db.execute(
      sql`SELECT count(*)::int n FROM requests.requests WHERE idempotency_key = ${key}`,
    );
    expect(n).toBe(1);
    await t.close();
  });

  it("another member reusing Idempotency-Key gets 409, not the original row", async () => {
    const t = await testApp({ suite: "requests-idor-key" });
    const key = crypto.randomUUID();
    const a = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key });
    expect(a.status).toBe(201);
    const b = await t.submitRequestAs(
      t.memberB,
      t.sampleRequestBody({ contact: { name: "Bob", phone: "+12125550222", email: "bob@test.dev" } }),
      { idempotencyKey: key },
    );
    expect(b.status).toBe(409);
    await t.close();
  });

  it("requires Idempotency-Key", async () => {
    const t = await testApp({ suite: "requests-key" });
    const r = await t.app.request("/v1/requests", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify(t.sampleRequestBody()),
    });
    expect(r.status).toBe(400);
    await t.close();
  });
});

describe("GET /v1/requests", () => {
  it("lists only the caller's requests", async () => {
    const t = await testApp({ suite: "requests-list" });
    await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    await t.submitRequestAs(
      t.memberB,
      t.sampleRequestBody({ contact: { name: "Bob", phone: "+12125550222", email: "bob@test.dev" } }),
    );
    const r = await t.app.request("/v1/requests", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: { id: string }[] };
    expect(body.items.length).toBe(1);
    await t.close();
  });
});

describe("POST /v1/internal/requests/:id/status", () => {
  it("updates status idempotently", async () => {
    const t = await testApp({ suite: "requests-status" });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-Secret": t.internalSecret,
    };
    const a = await t.app.request(`/v1/internal/requests/${id}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "quoted", note: "ready" }),
    });
    expect(a.status).toBe(200);
    const b = await t.app.request(`/v1/internal/requests/${id}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "quoted", note: "ready again" }),
    });
    expect(b.status).toBe(200);
    expect(((await b.json()) as { unchanged: boolean }).unchanged).toBe(true);
    const [{ n }]: any = await t.db.execute(
      sql`SELECT count(*)::int n FROM requests.request_events WHERE request_id = ${id} AND status = 'quoted'`,
    );
    expect(n).toBe(1);
    await t.close();
  });
});

describe("send-requests job", () => {
  it("retries failures and stops after six attempts", async () => {
    const t = await testApp({ suite: "requests-job" });
    t.crm.setSubmitFails(100);
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();

    for (let i = 0; i < 8; i++) {
      await t.db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
      await t.platform.jobs.run("send-requests");
    }

    const [row]: any = await t.db.execute(
      sql`SELECT sent_to_crm, send_attempts, last_error FROM requests.requests WHERE id = ${id}`,
    );
    expect(row.sent_to_crm).toBe(false);
    expect(Number(row.send_attempts)).toBeGreaterThanOrEqual(6);
    expect(row.last_error).toBeTruthy();

    const attempts = Number(row.send_attempts);
    await t.db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
    await t.platform.jobs.run("send-requests");
    const [row2]: any = await t.db.execute(sql`SELECT send_attempts FROM requests.requests WHERE id = ${id}`);
    expect(Number(row2.send_attempts)).toBe(attempts);

    await t.close();
  });

  it("succeeds on retry after CRM recovers", async () => {
    const t = await testApp({ suite: "requests-job-ok" });
    t.crm.setSubmitFails(1);
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll(); // consumer fails once
    await t.platform.jobs.run("send-requests"); // may still be in backoff window
    // Force claim by clearing sent_at
    await t.db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
    await t.platform.jobs.run("send-requests");
    const [row]: any = await t.db.execute(
      sql`SELECT sent_to_crm, crm_request_id FROM requests.requests WHERE id = ${id}`,
    );
    expect(row.sent_to_crm).toBe(true);
    expect(row.crm_request_id).toBeTruthy();
    await t.close();
  });
});
