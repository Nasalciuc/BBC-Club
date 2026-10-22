import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { ModuleRegistry } from "../src/registry";

/** One module on a fake host whose database and kill flag fail `dbFailures` / `flagFailures` times before answering
 *  (Infinity: never). The flag fails like the real one: `killState` throws, `isKilled` fails closed. */
function flakyHost(opts: { dbFailures?: number; flagFailures?: number }) {
  const calls = { db: 0, flags: 0, init: 0 };
  const mounted: string[] = [];
  const consumers: string[] = [];
  const refused = () => new Error("connect ECONNREFUSED 127.0.0.1:6432");
  const db = {
    execute: async () => {
      calls.db++;
      if (calls.db <= (opts.dbFailures ?? 0)) throw refused();
      return [];
    },
  };
  const killState = async () => {
    calls.flags++;
    if (calls.flags <= (opts.flagFailures ?? 0)) throw refused();
    return false;
  };
  const platform = {
    logger: { info() {}, warn() {}, error() {}, fatal() {} },
    flags: { killState, isKilled: () => killState().catch(() => true) },
    events: { registerConsumer: (_type: string, name: string) => void consumers.push(name) },
    jobs: { register() {} },
  };
  const registry = new ModuleRegistry().add({
    name: "alpha",
    layer: "domain",
    init: async () => {
      calls.init++;
      return {
        exposes: {},
        routes: [{ basePath: "/v1", app: new Hono() }],
        consumers: [{ type: "alpha.happened", name: "alpha.onHappened", handler: async () => {} }],
        jobs: [],
      };
    },
  });
  const boot = () =>
    registry.boot({
      db,
      platform,
      env: {},
      mount: (basePath: string) => void mounted.push(basePath),
      retryDelaysMs: [1, 1, 1, 1, 1],
    } as unknown as Parameters<ModuleRegistry["boot"]>[0]);
  return { boot, calls, mounted, consumers };
}

describe("boot against a database that is not up yet", () => {
  it("waits for the database before reading any kill flag", async () => {
    const h = flakyHost({ dbFailures: 3 });
    await h.boot();
    expect(h.calls.db).toBe(4);
    expect(h.mounted).toEqual(["/v1"]);
  });

  it("a kill flag unreadable twice, then false, mounts the module with its consumers", async () => {
    const h = flakyHost({ flagFailures: 2 });
    await h.boot();
    expect(h.calls.flags).toBe(3);
    expect(h.mounted).toEqual(["/v1"]);
    expect(h.consumers).toEqual(["alpha.onHappened"]);
  });

  it("a kill flag that never reads rejects boot and mounts nothing", async () => {
    const h = flakyHost({ flagFailures: Infinity });
    await expect(h.boot()).rejects.toMatchObject({ name: "DatabaseUnreachable" });
    expect(h.calls.flags).toBe(6); // the first read and five retries
    expect(h.mounted).toEqual([]);
    expect(h.consumers).toEqual([]);
  });

  it("a database that never answers rejects boot before any module starts", async () => {
    const h = flakyHost({ dbFailures: Infinity });
    await expect(h.boot()).rejects.toMatchObject({ name: "DatabaseUnreachable" });
    expect(h.calls.db).toBe(6);
    expect(h.calls.init).toBe(0);
    expect(h.calls.flags).toBe(0);
    expect(h.mounted).toEqual([]);
  });
});

describe("host boot", () => {
  it("mounts every module, satisfies every port, and every consumed event has a handler", async () => {
    const t = await testApp({ suite: "boot" });
    const registry = t.platform.events.registry;
    const owed: string[] = [];
    for (const [type, def] of Object.entries(EVENT_CATALOGUE)) {
      const consumers = registry.consumersOf(type);
      const d = def as { noConsumer?: boolean; consumerOwedBy?: string; deprecated?: string };
      // OR, not XOR: deprecated already implies no live consumer. Setting both is redundant but still excused.
      if (d.noConsumer || d.deprecated) continue;
      if (consumers.length === 0 && d.consumerOwedBy) {
        owed.push(`${type} (${d.consumerOwedBy})`);
        continue;
      }
      expect({ type, consumers }).toMatchObject({ type, consumers: expect.arrayContaining([expect.any(String)]) });
    }
    if (owed.length) console.warn(`consumers still owed: ${owed.join(", ")}`);
    await t.close();
  });

  it("/ready answers for this process alone; /status explains what is wrong; /health is always cheap", async () => {
    const t = await testApp({ suite: "boot" });
    const ready = await t.app.request("/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ ok: true, db: true });
    const body = await (await t.app.request("/status")).json();
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("queue");
    expect(body).toHaveProperty("staleJobs");
    expect((await t.app.request("/health")).status).toBe(200);
    await t.close();
  });

  it("a dead letter turns /status red and leaves /ready green, so the deploy that fixes it can still roll", async () => {
    const t = await testApp({ suite: "boot" });
    await t.db.execute(
      sql`UPDATE platform.event_deliveries SET status = 'dead' WHERE id = (SELECT min(id) FROM platform.event_deliveries)`,
    );
    const status = await t.app.request("/status");
    expect(status.status).toBe(503);
    expect(((await status.json()) as { ok: boolean; queue: { dead: number } }).queue.dead).toBe(1);
    expect((await t.app.request("/ready")).status).toBe(200);
    await t.close();
  });

  it("a scheduled job whose last finished run failed turns /status red and leaves /ready green", async () => {
    const t = await testApp({ suite: "boot" });
    const job = t.platform.jobs.schedule().find((j) => j.name === "retention");
    expect(job).toBeDefined();
    const run = (status: "failed" | "succeeded" | "running" | "skipped", secondsFromNow: number) =>
      t.db.execute(sql`INSERT INTO platform.job_runs (job, status, started_at, finished_at)
        VALUES ('retention', ${status}::platform.job_run_status, now() + ${secondsFromNow} * interval '1 second',
                CASE WHEN ${status} = 'running' THEN NULL ELSE now() + ${secondsFromNow} * interval '1 second' END)`);
    const status = async () => {
      const res = await t.app.request("/status");
      return {
        code: res.status,
        body: (await res.json()) as { ok: boolean; failingJobs: string[]; staleJobs: string[] },
      };
    };

    await run("failed", 1);
    let s = await status();
    expect(s.code).toBe(503);
    expect(s.body.failingJobs).toEqual(["retention"]);
    expect(s.body.staleJobs).toEqual([]);
    expect((await t.app.request("/ready")).status).toBe(200);

    // A run still going, or one skipped behind the lock, says nothing yet about the failure.
    await run("skipped", 2);
    await run("running", 3);
    expect((await status()).body.failingJobs).toEqual(["retention"]);

    await run("succeeded", 4);
    s = await status();
    expect(s.body.failingJobs).toEqual([]);
    expect(s.code).toBe(200);
    await t.close();
  });

  it("a killed module is not mounted and its routes answer 404, other modules unaffected", async () => {
    const t = await testApp({ suite: "boot" });
    await t.flags.kill("requests");
    await t.restart();
    expect((await t.submitRequestAs(t.memberA, t.sampleRequestBody())).status).toBe(404);
    expect((await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } })).status).toBe(200);
    expect((await t.app.request("/v1/inbox", { headers: { Cookie: t.memberA.cookie } })).status).toBe(200);
    await t.flags.revive("requests");
    await t.close();
  });

  it("errors have one shape: validation → 400 with details", async () => {
    const t = await testApp({ suite: "boot" });
    const bad = await t.submitRequestAs(t.memberA, { tripType: "round", cabin: "business" });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: string; details?: { path: string }[] } };
    expect(body.error.code).toBe("VALIDATION");
    await t.close();
  });
});

describe("smoke = Demo 2", () => {
  it("register → code → feed → request → drained → CRM has the submit", async () => {
    const t = await testApp({ suite: "boot" });
    const email = "new.member@test.dev";
    const signUp = await t.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
      body: JSON.stringify({ email, password: "atlantic2026!", name: "" }),
    });
    expect(signUp.status).toBeLessThan(400);
    const otp = t.email.lastOtp(email);
    const verify = await t.app.request("/api/auth/email-otp/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "bbcclub://" },
      body: JSON.stringify({ email, otp }),
    });
    expect(verify.status).toBeLessThan(400);
    const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    await t.drainAll();
    const offerId = await t.seedBroadcastOffer();
    const feed = await t.app.request("/v1/proposals", { headers: { Cookie: cookie } });
    expect(feed.status).toBe(200);
    const feedBody = (await feed.json()) as { items: { id: string }[] };
    expect(feedBody.items.some((i) => i.id === offerId)).toBe(true);

    const r = await t.app.request("/v1/requests", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "X-App-Platform": "ios",
      },
      body: JSON.stringify(
        t.sampleRequestBody({
          offerId,
          contact: { name: "New Member", phone: "+12125550999", email },
        }),
      ),
    });
    expect(r.status).toBe(201);
    await t.drainAll();
    await t.platform.jobs.run("send-requests");
    expect(t.crm.submitted.length).toBeGreaterThan(0);
    const [{ n }]: any = await t.db.execute(
      sql`SELECT count(*)::int n FROM requests.requests WHERE contact_email = ${email}`,
    );
    expect(n).toBe(1);
    await t.close();
  });
});
