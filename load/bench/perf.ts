/**
 * Where a request's work goes, per route (ADR-IMPL-074, ADR-IMPL-075): the API's CPU, Postgres's statements and plans.
 * In-process requests (`app.request`), one member, the read limits lifted as in run.ts; 200 to warm, then PERF_N.
 *
 * The run fails on what does not depend on the machine: statements and plans per request against
 * `perf-thresholds.json`, and each route's API CPU as a multiple of `/health`'s — asked without a cookie, the API's own
 * floor — in the same run (a slower runner slows both). Absolute milliseconds are reported, never judged: they come from k6 on staging and from Grafana.
 *
 *   bun run load/bench/perf.ts                 # PERF_N=1000, report in load/bench/perf-report.json
 *   PERF_ONLY=home,fare PERF_COOKIE=stale bun run load/bench/perf.ts
 *
 * PERF_COOKIE=stale sends the session token alone — what the app sends after its first minute — so the session is
 * the server's to keep (ADR-IMPL-076). Postgres needs pg_stat_statements (compose.test.yml loads it).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { loadEnv } from "@bbc/shared/env";
import { buildApp } from "../../apps/api/src/index";
import type { IdentityFacade } from "@bbc/identity";

const N = Number(process.env.PERF_N ?? 1000);
const ONLY = process.env.PERF_ONLY?.split(",");
const STALE = process.env.PERF_COOKIE === "stale";
const HERE = import.meta.dir;
const EMAIL = "bench.member@test.dev";
const PASSWORD = "atlantic2026!";

const CASES = [
  // The unit the CPU is judged in: no cookie, so no session is read — the API's own floor on this machine.
  { name: "health", path: "/health", anonymous: true },
  { name: "home", path: "/v1/home" },
  { name: "proposals", path: "/v1/proposals" },
  { name: "search", path: "/v1/search?from=JFK&to=LHR&cabin=business" },
  { name: "fare", path: "/v1/fares/00000000-0000-4000-8000-00000000fa01" },
  { name: "profile", path: "/v1/profile" },
  { name: "requests", path: "/v1/requests" },
  { name: "inbox", path: "/v1/inbox" },
  { name: "airports-q", path: "/v1/airports?q=lon" },
  { name: "airports-popular", path: "/v1/airports/popular?from=JFK" },
  { name: "places-photos", path: "/v1/places/photos?codes=LHR,CDG,JFK,NRT,DXB" },
  { name: "app-config", path: "/v1/app-config" },
].filter((c) => !ONLY || c.name === "health" || ONLY.includes(c.name));

type Threshold = { stmtsPerReq: number; plansPerReq: number; cpuVsHealth: number };
const THRESHOLDS = JSON.parse(readFileSync(join(HERE, "perf-thresholds.json"), "utf8")) as Record<string, Threshold>;

type Stat = { query: string; calls: number; plans: number; exec_ms: number; plan_ms: number };
type RouteReport = {
  status: number;
  appCpuMsPerReq: number;
  cpuVsHealth: number;
  stmtsPerReq: number;
  plansPerReq: number;
  execMsPerReq: number;
  planMsPerReq: number;
  p50: number;
  p99: number;
  top: { perReq: number; plans: number; q: string }[];
};

const LIFTED = ["ratelimit.read", "ratelimit.search", "ratelimit.anon"];
// The run empties pg_stat_statements for the whole server and lifts the read limits: a test database only, by the
// rule every database test keeps (its name says `test`, as preload.ts and isolatedDb ask), before anything connects.
const env = loadEnv();
if (!/test/i.test(new URL(env.DATABASE_URL).pathname)) {
  console.error(
    `perf.ts refuses to run: DATABASE_URL names "${new URL(env.DATABASE_URL).pathname.slice(1)}", not a test database. ` +
      "It resets pg_stat_statements for the whole server; point it at compose.test.yml's bbc_test (header).",
  );
  process.exit(1);
}
const built = await buildApp({ startPoller: false, env });
const { app, db } = built;
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`);
const kept = (await db.execute(sql`SELECT key, value FROM platform.flags WHERE key IN ${LIFTED}`)) as unknown as {
  key: string;
  value: Record<string, unknown>;
}[];
for (const key of LIFTED) await built.platform.flags.set(key, { limit: 1e9, burst: 1e9 }, "perf run: no limit");

const auth = built.registry.facade<IdentityFacade>("identity").auth;
async function cookieOf(): Promise<string> {
  let res = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true });
  if (!res.ok) {
    await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: "Bench" } });
    await db.execute(sql`UPDATE auth."user" SET email_verified = true WHERE email = ${EMAIL}`);
    await built.platform.poller.drainOnce();
    res = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true });
  }
  const all = (res.headers.get("set-cookie") ?? "")
    .split(",")
    .map((c) => (c.split(";")[0] ?? "").trim())
    .filter(Boolean);
  return (STALE ? all.filter((c) => /session_token=/.test(c)) : all).join("; ");
}

const routes: Record<string, RouteReport> = {};
const failures: string[] = [];
try {
  const cookie = await cookieOf();
  for (const c of CASES) {
    const headers = "anonymous" in c ? {} : { cookie };
    let status = 0;
    // Every answer counts, not only the last: a route that fails between successes still fails the run.
    let bad = 0;
    let firstBad = 0;
    const seen = (s: number) => {
      status = s;
      if (s >= 400) {
        bad++;
        firstBad ||= s;
      }
    };
    for (let i = 0; i < 200; i++) {
      const r = await app.request(c.path, { headers });
      seen(r.status);
      await r.arrayBuffer();
    }
    await db.execute(sql`SELECT pg_stat_statements_reset()`);
    const cpu0 = process.cpuUsage();
    const lat: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = performance.now();
      const r = await app.request(c.path, { headers });
      await r.arrayBuffer();
      seen(r.status);
      lat.push(performance.now() - t);
    }
    const cpu = process.cpuUsage(cpu0);
    const stats = (await db.execute(sql`
      SELECT query, calls::int, plans::int, total_exec_time::float8 AS exec_ms, total_plan_time::float8 AS plan_ms
      FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
      ORDER BY total_exec_time + total_plan_time DESC`)) as unknown as Stat[];
    lat.sort((a, b) => a - b);
    const sum = (k: keyof Stat) => stats.reduce((s, r) => s + Number(r[k]), 0);
    const appCpu = (cpu.user + cpu.system) / 1000 / N;
    routes[c.name] = {
      status,
      appCpuMsPerReq: +appCpu.toFixed(3),
      cpuVsHealth: routes.health ? +(appCpu / routes.health.appCpuMsPerReq).toFixed(2) : 1,
      stmtsPerReq: +(sum("calls") / N).toFixed(2),
      plansPerReq: +(sum("plans") / N).toFixed(2),
      execMsPerReq: +(sum("exec_ms") / N).toFixed(3),
      planMsPerReq: +(sum("plan_ms") / N).toFixed(3),
      p50: +lat[N >> 1]!.toFixed(2),
      p99: +lat[Math.floor(N * 0.99)]!.toFixed(2),
      top: stats.slice(0, 5).map((s) => ({
        perReq: +(s.calls / N).toFixed(2),
        plans: s.plans,
        q: s.query.replace(/\s+/g, " ").slice(0, 160),
      })),
    };
    const r = routes[c.name]!;
    console.log(
      `${c.name.padEnd(17)} ${String(status).padEnd(4)} cpu ${r.appCpuMsPerReq} ms (×${r.cpuVsHealth} health) · ` +
        `${r.stmtsPerReq} stmts · ${r.plansPerReq} plans · p50 ${r.p50} ms`,
    );
    if (bad) failures.push(`${c.name}: ${bad} of ${200 + N} answers ≥ 400 (the first ${firstBad})`);
    const t = THRESHOLDS[c.name];
    if (t) {
      if (r.stmtsPerReq > t.stmtsPerReq)
        failures.push(`${c.name}: ${r.stmtsPerReq} statements a request (≤ ${t.stmtsPerReq})`);
      if (r.plansPerReq > t.plansPerReq)
        failures.push(`${c.name}: ${r.plansPerReq} plans a request (≤ ${t.plansPerReq})`);
      if (r.cpuVsHealth > t.cpuVsHealth)
        failures.push(`${c.name}: CPU ×${r.cpuVsHealth} health's (≤ ×${t.cpuVsHealth})`);
    }
  }
} finally {
  for (const key of LIFTED) {
    const row = kept.find((r) => r.key === key);
    if (row) await built.platform.flags.set(key, row.value);
    else await db.execute(sql`DELETE FROM platform.flags WHERE key = ${key}`);
  }
}
writeFileSync(join(HERE, "perf-report.json"), JSON.stringify({ n: N, staleCookie: STALE, routes, failures }, null, 2));
await built.shutdown();
if (failures.length) console.error(`\n${failures.join("\n")}`);
process.exit(failures.length ? 1 : 0);
