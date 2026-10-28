/**
 * Requests reach the specialists, through the CRM the env names, as a deployed host builds it (brief 3.6, D14).
 * - `CRM_ADAPTER=email`: one request is exactly one operator e-mail with its three links; following Quoted moves the
 *   member's request to quoted.
 * - `CRM_ADAPTER=http` (ADR-IMPL-065), against a fake CRM started here: the request arrives signed and keyed on its
 *   reference; the CRM's `quoted`, sent back through `POST /v1/internal/requests/:id/status`, reaches the member; a
 *   request the CRM refuses is given up at once. Sign-up does not depend on the CRM.
 * Every name, address and secret here is made up.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

const OPS_LINK_SECRET = "ops-link-secret-made-up-for-tests-000000";
const CRM_API_SECRET = "crm-api-secret-made-up-for-tests-0000000";

type App = Awaited<ReturnType<typeof testApp>>;
type MemberView = { status: string; reference: string; timeline: { status: string; note?: string | null }[] };

async function memberView(t: App, id: string): Promise<MemberView> {
  const r = await t.app.request(`/v1/requests/${id}`, { headers: { Cookie: t.memberA.cookie } });
  expect(r.status).toBe(200);
  return (await r.json()) as MemberView;
}

async function submit(t: App): Promise<string> {
  const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
  expect(created.status).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await t.drainAll();
  return id;
}

/** The job's next run, five minutes on: a request still unsent would be tried again. */
async function runAgainLater(t: App, id: string) {
  await t.db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
  await t.platform.jobs.run("send-requests");
}

describe("CRM_ADAPTER=email — one request, one operator e-mail, three links (D14)", () => {
  it("the specialists get one e-mail with Quote sent, Booked and Closed; following Quoted reaches the member", async () => {
    const t = await testApp({
      suite: "crm-email-d14",
      crm: "env",
      env: { CRM_ADAPTER: "email", OPERATORS_EMAIL: "specialists@test.dev", OPS_LINK_SECRET },
    });
    try {
      const id = await submit(t);
      await t.platform.jobs.run("send-requests");
      // Sent: a later run does not send it again.
      await runAgainLater(t, id);
      expect(t.email.operator).toHaveLength(1);
      const mail = t.email.operator[0]!;
      expect(mail.to).toBe("specialists@test.dev");
      expect(mail.replyTo).toBe("alex@test.dev");
      // The reference the request page shows is the one the e-mail names: a specialist finds the request by it.
      const sent = await memberView(t, id);
      expect(sent.status).toBe("received");
      expect(sent.reference).toMatch(/^R-[0-9A-F]{8}$/);
      expect(mail.subject).toContain(sent.reference);
      expect(mail.text).toContain(sent.reference);

      const linkOf = (label: string) => {
        const lines = mail.text.split("\n").filter((l) => l.startsWith(`${label}:`));
        expect(lines).toHaveLength(1);
        return lines[0]!.split(/\s+/).pop() ?? "";
      };
      const links = { quoted: linkOf("Quote sent"), booked: linkOf("Booked"), closed: linkOf("Closed") };
      for (const link of Object.values(links)) expect(link.startsWith(`${t.appOrigin}/ops/requests/`)).toBe(true);
      expect(new Set(Object.values(links)).size).toBe(3);

      // Following Quoted: the link opens a page that asks to confirm (a mail preview changes nothing), and confirming
      // marks the request.
      const path = new URL(links.quoted).pathname;
      const page = await t.app.request(path);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Mark as quote sent");
      expect((await memberView(t, id)).status).toBe("received");
      const marked = await t.app.request(path, { method: "POST" });
      expect(marked.status).toBe(200);
      expect(await marked.text()).toContain("Marked as quote sent.");

      const quoted = await memberView(t, id);
      expect(quoted.status).toBe("quoted");
      expect(quoted.timeline.map((e) => e.status)).toEqual(["received", "quoted"]);
      const list = await t.app.request("/v1/requests", { headers: { Cookie: t.memberA.cookie } });
      const items = ((await list.json()) as { items: { id: string; status: string }[] }).items;
      expect(items.find((r) => r.id === id)?.status).toBe("quoted");
    } finally {
      await t.close();
    }
  });
});

describe("CRM_ADAPTER=http — the request reaches the CRM signed; the CRM's quoted reaches the member", () => {
  type Seen = { headers: Headers; body: string };
  const seen: Seen[] = [];
  let answer = 201;
  let server: ReturnType<typeof Bun.serve>;
  let t: App;
  /** Calls the CRM got while the host was built and two members joined. */
  let callsAtSignUp = -1;

  beforeAll(async () => {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        seen.push({ headers: req.headers, body: await req.text() });
        return new Response(null, { status: answer });
      },
    });
    t = await testApp({
      suite: "crm-http",
      crm: "env",
      env: { CRM_ADAPTER: "http", CRM_API_URL: `http://127.0.0.1:${server.port}/requests`, CRM_API_SECRET },
    });
    callsAtSignUp = seen.length;
  });
  afterAll(async () => {
    await t.close();
    await server.stop(true);
  });
  beforeEach(async () => {
    seen.length = 0;
    answer = 201;
    // Only this test's request: an earlier one left unsent would be claimed too.
    await t.db.execute(sql`UPDATE requests.requests SET status = 'closed' WHERE sent_to_crm = false`);
  });

  it("sign-up does not wait on the CRM: the member exists, on the waitlist, without a CRM call", async () => {
    const rows = (await t.db.execute(
      sql`SELECT status FROM members.profile WHERE member_id = ${t.memberA.id}`,
    )) as unknown as { status: string }[];
    expect(rows[0]?.status).toBe("waitlist");
    expect(callsAtSignUp).toBe(0);
  });

  it("one signed call keyed on the reference; the CRM's quoted, sent back, is what the member reads", async () => {
    const id = await submit(t);
    await t.platform.jobs.run("send-requests");
    await runAgainLater(t, id);
    expect(seen).toHaveLength(1);
    const call = seen[0]!;
    // The CRM's check (ADR-IMPL-065): HMAC-SHA256 of `timestamp.body` with the shared secret.
    const timestamp = call.headers.get("x-bbc-timestamp") ?? "";
    const want = createHmac("sha256", CRM_API_SECRET).update(`${timestamp}.${call.body}`).digest();
    const got = Buffer.from(call.headers.get("x-bbc-signature") ?? "", "hex");
    expect(got.length === want.length && timingSafeEqual(got, want)).toBe(true);

    const body = JSON.parse(call.body) as {
      reference: string;
      _request_id: string;
      client: { email: string };
      _actions?: unknown;
    };
    const sent = await memberView(t, id);
    expect(sent.reference).toMatch(/^R-/);
    expect(call.headers.get("idempotency-key")).toBe(sent.reference);
    expect(body.reference).toBe(sent.reference);
    expect(body._request_id).toBe(id);
    expect(body.client.email).toBe("alex@test.dev");
    // Operator links are the e-mail's: the CRM reports a status through the route below.
    expect(body._actions).toBeUndefined();
    const [row] = (await t.db.execute(
      sql`SELECT sent_to_crm, crm_request_id FROM requests.requests WHERE id = ${id}`,
    )) as unknown as { sent_to_crm: boolean; crm_request_id: string }[];
    expect(row).toEqual({ sent_to_crm: true, crm_request_id: `http:${sent.reference}` });

    // The CRM marks it quoted, as it would: its own call, with the system's secret, to the request it was given.
    const back = await t.app.request(`/v1/internal/requests/${body._request_id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
      body: JSON.stringify({ status: "quoted", note: "Your agent will call you today.", agentId: "crm-agent" }),
    });
    expect(back.status).toBe(200);
    expect(await back.json()).toEqual({ ok: true, unchanged: false });
    const quoted = await memberView(t, id);
    expect(quoted.status).toBe("quoted");
    const step = quoted.timeline.find((e) => e.status === "quoted");
    expect(step?.note).toBe("Your agent will call you today.");
    // Without the system's secret, the CRM's call is refused.
    const anonymous = await t.app.request(`/v1/internal/requests/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "booked" }),
    });
    expect(anonymous.status).toBe(401);
  });

  it("a 503 is tried again and then sent once; a 400 is given up at once and the member reads not_sent", async () => {
    answer = 503;
    const retried = await submit(t);
    await t.platform.jobs.run("send-requests");
    answer = 201;
    await runAgainLater(t, retried);
    expect(seen.map((c) => c.headers.get("idempotency-key"))).toEqual([
      (await memberView(t, retried)).reference,
      (await memberView(t, retried)).reference,
    ]);
    expect(seen[1]!.body).toBe(seen[0]!.body);

    seen.length = 0;
    await t.db.execute(sql`UPDATE requests.requests SET status = 'closed' WHERE id = ${retried}`);
    answer = 400;
    const refused = await submit(t);
    await t.platform.jobs.run("send-requests");
    await runAgainLater(t, refused);
    expect(seen).toHaveLength(1);
    expect((await memberView(t, refused)).status).toBe("not_sent");
    const [row] = (await t.db.execute(
      sql`SELECT send_attempts::int AS attempts, last_error FROM requests.requests WHERE id = ${refused}`,
    )) as unknown as { attempts: number; last_error: string }[];
    expect(row).toEqual({ attempts: 6, last_error: "CrmHttpError: CRM submitRequest answered 400 (permanent)" });
  });
});
