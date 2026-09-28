/** Worker jobs db-observe / db-report and GET /v1/internal/db-report (ops:read). */
import { connect } from "node:net";
import { describe, expect, it } from "bun:test";
import { maybeAlertOps, pgbouncerWaitingClients, resetDbAlertState } from "@bbc/platform";
import { testApp } from "./helpers/test-app";

const silent = { warn: () => {} };

function portOpen(url: string): Promise<boolean> {
  const parsed = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({ host: parsed.hostname, port: Number(parsed.port || 5432) });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}
const emptySnap = {
  connections: [] as { app: string; state: string; n: number }[],
  oldestTx: [] as { app: string; s: number }[],
  lockWaits: 0,
  deadlocks: 0,
  poolWaiting: 0,
  oldestTxSeconds: 0,
};

describe("database observability", () => {
  it("db-observe and db-report jobs succeed", async () => {
    const t = await testApp({ suite: "db-observe" });
    const observe = await t.app.request("/v1/internal/run/db-observe", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(observe.status).toBe(200);
    const reportJob = await t.app.request("/v1/internal/run/db-report", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(reportJob.status).toBe(200);
    await t.close();
  });

  it("GET /v1/internal/db-report is ops:read", async () => {
    const t = await testApp({ suite: "db-report-get" });
    expect((await t.app.request("/v1/internal/db-report")).status).toBe(401);
    expect((await t.app.request("/v1/internal/db-report", { headers: { Cookie: t.memberA.cookie } })).status).toBe(403);
    const ok = await t.app.request("/v1/internal/db-report", {
      headers: { Authorization: `Bearer ${t.operatorJwt}` },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { generatedAt?: string; meaningfulAfterDays?: number };
    expect(body.generatedAt).toBeTruthy();
    expect(body.meaningfulAfterDays).toBe(7);
    await t.close();
  });

  it("maybeAlertOps POSTs oldest_tx and two-minute pool_waiting to OPS_WEBHOOK", async () => {
    resetDbAlertState();
    const received: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        received.push(await req.text());
        return new Response("ok");
      },
    });
    const prev = process.env.OPS_WEBHOOK;
    process.env.OPS_WEBHOOK = `http://127.0.0.1:${server.port}/`;
    try {
      const oldest = await maybeAlertOps({ ...emptySnap, oldestTxSeconds: 31 }, silent, 1_000);
      expect(oldest).toBe(1);
      expect(received.some((b) => b.includes("oldest_tx=31"))).toBe(true);

      resetDbAlertState();
      received.length = 0;
      const t0 = 10_000;
      expect(await maybeAlertOps({ ...emptySnap, poolWaiting: 3 }, silent, t0)).toBe(0);
      expect(received).toEqual([]);
      const later = await maybeAlertOps({ ...emptySnap, poolWaiting: 3 }, silent, t0 + 120_000);
      expect(later).toBe(1);
      expect(received.some((b) => b.includes("pool_waiting=3"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.OPS_WEBHOOK;
      else process.env.OPS_WEBHOOK = prev;
      server.stop();
      resetDbAlertState();
    }
  });

  it("a failed pooler sample does not reset the waiting window", async () => {
    resetDbAlertState();
    const received: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        received.push(await req.text());
        return new Response("ok");
      },
    });
    const prev = process.env.OPS_WEBHOOK;
    process.env.OPS_WEBHOOK = `http://127.0.0.1:${server.port}/`;
    try {
      const t0 = 20_000;
      expect(await maybeAlertOps({ ...emptySnap, poolWaiting: 3 }, silent, t0)).toBe(0);
      expect(await maybeAlertOps({ ...emptySnap, poolWaiting: null }, silent, t0 + 60_000)).toBe(0);
      expect(received).toEqual([]);
      const later = await maybeAlertOps({ ...emptySnap, poolWaiting: 3 }, silent, t0 + 120_000);
      expect(later).toBe(1);
      expect(received.some((b) => b.includes("pool_waiting=3"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.OPS_WEBHOOK;
      else process.env.OPS_WEBHOOK = prev;
      server.stop();
      resetDbAlertState();
    }
  });

  it("SHOW POOLS against compose PgBouncer returns rows", async () => {
    const base = process.env.PGBOUNCER_URL;
    if (!base || !(await portOpen(base))) return;
    const admin = base.replace(/\/[^/?]*(\?|$)/, "/pgbouncer$1");
    const sample = await pgbouncerWaitingClients(admin, silent);
    expect(sample).not.toBeNull();
    expect(typeof sample?.waiting).toBe("number");
    expect(sample?.pools).toBeGreaterThanOrEqual(1);
  });

  it("a refused admin connection warns once and returns null", async () => {
    const warns: { err?: unknown; message?: string }[] = [];
    const logger = {
      warn: (o: object, m?: string) =>
        warns.push({ err: "err" in o ? (o as { err: unknown }).err : undefined, message: m }),
    };
    const sample = await pgbouncerWaitingClients("postgres://bbc:bbc@127.0.0.1:1/pgbouncer", logger);
    expect(sample).toBeNull();
    expect(warns).toHaveLength(1);
    expect(warns[0]?.message).toContain("SHOW POOLS failed");
    expect(warns[0]?.err).toBeInstanceOf(Error);
  });

  it("an aborted job signal stops the webhook", async () => {
    resetDbAlertState();
    const prev = process.env.OPS_WEBHOOK;
    process.env.OPS_WEBHOOK = "http://127.0.0.1:9/";
    const ac = new AbortController();
    ac.abort();
    try {
      await expect(maybeAlertOps({ ...emptySnap, oldestTxSeconds: 31 }, silent, 1_000, ac.signal)).rejects.toThrow();
    } finally {
      if (prev === undefined) delete process.env.OPS_WEBHOOK;
      else process.env.OPS_WEBHOOK = prev;
      resetDbAlertState();
    }
  });
});
