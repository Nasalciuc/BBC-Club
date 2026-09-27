import { sql } from "drizzle-orm";
import { z } from "zod";
import { buildApp } from "../../apps/api/src/index";
import type { IdentityFacade } from "@bbc/identity";
import { createPlatform } from "@bbc/platform";

type Case = { name: string; method: "GET" | "POST"; path: string; body?: unknown };
const CASES: Case[] = [
  { name: "home", method: "GET", path: "/v1/home" },
  { name: "proposals", method: "GET", path: "/v1/proposals" },
  { name: "search", method: "GET", path: "/v1/search?from=JFK&to=LHR&cabin=business" },
  // Fixture fa01 is …fa01. The shortened id in the prompt draft 404s.
  { name: "fare", method: "GET", path: "/v1/fares/00000000-0000-4000-8000-00000000fa01" },
  { name: "profile", method: "GET", path: "/v1/profile" },
  { name: "requests", method: "GET", path: "/v1/requests" },
];
const N = Number(process.env.BENCH_N ?? 2_000);
const BENCH_EMAIL = "bench.member@test.dev";
const BENCH_PASSWORD = "atlantic2026!";

async function signInBenchMember(app: Awaited<ReturnType<typeof buildApp>>) {
  const auth = app.registry.facade<IdentityFacade>("identity").auth;
  const existing = await auth.api.signInEmail({
    body: { email: BENCH_EMAIL, password: BENCH_PASSWORD },
    asResponse: true,
  });
  if (!existing.ok) {
    await auth.api.signUpEmail({ body: { email: BENCH_EMAIL, password: BENCH_PASSWORD, name: "Bench" } });
    await app.db.execute(sql`UPDATE auth."user" SET email_verified = true WHERE email = ${BENCH_EMAIL}`);
    await app.platform.poller.drainOnce();
  }
  const res = existing.ok
    ? existing
    : await auth.api.signInEmail({
        body: { email: BENCH_EMAIL, password: BENCH_PASSWORD },
        asResponse: true,
      });
  if (!res.ok) throw new Error(`bench sign-in failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("bench sign-in returned no cookie");
  return setCookie
    .split(",")
    .map((c) => (c.split(";")[0] ?? "").trim())
    .filter(Boolean)
    .join("; ");
}

/** 20 000 no-op deliveries. A short count fails the run; 10s is a warning only. */
async function drainBacklog(db: Awaited<ReturnType<typeof buildApp>>["db"]) {
  const p = createPlatform(db, { level: "silent" });
  const Payload = z.object({ type: z.literal("bench.noop"), version: z.literal(1) });
  p.events.defineEvent("bench.noop", { version: 1, schema: Payload });
  p.events.registerConsumer("bench.noop", "bench.onNoop", async () => {});
  const total = 20_000;
  for (let i = 0; i < total; i += 500) {
    await db.transaction(async (tx) => {
      for (let j = 0; j < 500; j++) {
        const n = i + j;
        await p.events.publish(tx, {
          type: "bench.noop",
          aggregateType: "bench",
          aggregateId: `b-${n}`,
          payload: { type: "bench.noop", version: 1 },
          publishedBy: "bench",
        });
      }
    });
  }
  const t0 = performance.now();
  let n = 0;
  for (;;) {
    const k = await p.poller.drainOnce(total);
    n += k;
    if (k === 0) break;
  }
  const sec = (performance.now() - t0) / 1000;
  const rate = sec === 0 ? n : n / sec;
  console.log(`poller drain: ${n} deliveries in ${sec.toFixed(2)}s (${rate.toFixed(0)}/s)`);
  if (n !== total) throw new Error(`poller drain delivered ${n}, expected ${total}`);
  if (sec >= 10) console.error(`poller drain took ${sec.toFixed(2)}s (warning only; 10s is not a gate)`);
}

const built = await buildApp({ startPoller: false });
const cookie = await signInBenchMember(built);
const { app, shutdown } = built;

const report: Record<string, { cpuMsPerReq: number; p50: number; p99: number }> = {};
for (const c of CASES) {
  for (let i = 0; i < 200; i++) await app.request(c.path, { headers: { cookie } });
  const lat: number[] = [];
  const cpu0 = process.cpuUsage();
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    const res = await app.request(c.path, { method: c.method, headers: { cookie } });
    if (res.status >= 400) throw new Error(`${c.name}: ${res.status} ${await res.text()}`);
    await res.arrayBuffer();
    lat.push(performance.now() - t);
  }
  const cpu = process.cpuUsage(cpu0);
  lat.sort((a, b) => a - b);
  const p50 = lat[N >> 1];
  const p99 = lat[Math.floor(N * 0.99)];
  if (p50 === undefined || p99 === undefined) throw new Error(`${c.name}: empty sample`);
  report[c.name] = {
    cpuMsPerReq: (cpu.user + cpu.system) / 1_000 / N,
    p50,
    p99,
  };
}
await drainBacklog(built.db);
await shutdown();
await Bun.write("load/bench/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const base = await Bun.file("load/bench/baseline.json")
  .json()
  .catch(() => null);
if (base)
  for (const [k, v] of Object.entries(report))
    if (base[k] && v.cpuMsPerReq > base[k].cpuMsPerReq * 1.2) {
      console.error(`${k}: +20% CPU regression`);
      process.exit(1);
    }
