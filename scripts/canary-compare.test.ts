import { describe, expect, it } from "bun:test";
import { createMetrics } from "../packages/modules/platform/src/telemetry/metrics";
import { compareMetrics } from "./canary-compare";

async function scrape(rows: { status: number; ms: number; n: number; route?: string }[]): Promise<string> {
  const m = createMetrics();
  for (const row of rows) {
    const route = row.route ?? "/v1/home";
    for (let i = 0; i < row.n; i++) {
      m.inc("http_requests", { route, status: String(row.status) });
      m.observe("http_duration_ms", row.ms, { route });
    }
  }
  return m.render();
}

const quiet = [{ status: 200, ms: 100, n: 100 }];

describe("canary compare", () => {
  it("fails when the canary 5xx ratio is over 1%", async () => {
    const canary = await scrape([
      { status: 200, ms: 100, n: 98 },
      { status: 500, ms: 100, n: 2 },
    ]);
    const old = await scrape(quiet);
    const v = compareMetrics(canary, old);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("5xx ratio");
  });

  it("fails when the canary 5xx ratio is more than twice the old replica", async () => {
    const old = await scrape([
      { status: 200, ms: 50, n: 90 },
      { status: 500, ms: 50, n: 10 },
    ]);
    const canary = await scrape([
      { status: 200, ms: 50, n: 79 },
      { status: 500, ms: 50, n: 21 },
    ]);
    expect(compareMetrics(canary, old).ok).toBe(false);
  });

  it("fails when the canary p99 is two buckets above the old replica and over the 300-ms floor", async () => {
    const old = await scrape([{ status: 200, ms: 300, n: 100 }]);
    const canary = await scrape([{ status: 200, ms: 750, n: 100 }]);
    const v = compareMetrics(canary, old);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("two or more above");
  });

  it("passes when the canary p99 is only one bucket above", async () => {
    const old = await scrape([{ status: 200, ms: 100, n: 100 }]);
    const canary = await scrape([{ status: 200, ms: 150, n: 100 }]);
    expect(compareMetrics(canary, old).ok).toBe(true);
  });

  it("with fewer than 50 requests, any 5xx fails and zero 5xx passes without a latency compare", async () => {
    const bad = await scrape([
      { status: 200, ms: 100, n: 9 },
      { status: 503, ms: 100, n: 1 },
    ]);
    const good = await scrape([{ status: 200, ms: 100, n: 10 }]);
    const old = await scrape(quiet);
    expect(compareMetrics(bad, old).ok).toBe(false);
    const pass = compareMetrics(good, old);
    expect(pass.ok).toBe(true);
    expect(pass.reason).toBe("canary served 10 requests (< 50); judged on /ready and zero 5xx only");
  });

  it("skips latency when the old replica served nothing and still applies the 1% 5xx floor", async () => {
    const quietCanary = await scrape(quiet);
    const v = compareMetrics(quietCanary, "");
    expect(v.ok).toBe(true);
    expect(v.reason).toContain("old replica served 0 requests; latency compare skipped");
    const noisy = await scrape([
      { status: 200, ms: 100, n: 98 },
      { status: 500, ms: 100, n: 2 },
    ]);
    expect(compareMetrics(noisy, "").ok).toBe(false);
  });

  // 30 Oct 2026: production rolled back on "canary p99 bucket 25 is two or more above old 5" — milliseconds, not a
  // regression. Below the launch p99 target, latency never fails a canary.
  it("passes a canary two buckets slower when it is still under 300 ms", async () => {
    const old = await scrape([{ status: 200, ms: 4, n: 100 }]);
    const canary = await scrape([{ status: 200, ms: 20, n: 100 }]);
    const v = compareMetrics(canary, old);
    expect(v.ok).toBe(true);
    expect(v.reason).toContain("p99 le=25 vs old le=5");
  });

  it("leaves the probes out: /health, /ready, /status and /metrics are never members' requests", async () => {
    // Today's shape: the canary's 600 s held ~80 probes and a few members; one slow /ready on a cold pool.
    const canary = await scrape([
      { status: 200, ms: 2, n: 60, route: "/health" },
      { status: 200, ms: 3, n: 20, route: "/metrics" },
      { status: 200, ms: 2000, n: 1, route: "/ready" },
      { status: 200, ms: 40, n: 5 },
    ]);
    const old = await scrape([{ status: 200, ms: 2, n: 5000, route: "/health" }]);
    const v = compareMetrics(canary, old);
    expect(v.ok).toBe(true);
    expect(v.reason).toBe("canary served 5 requests (< 50); judged on /ready and zero 5xx only");
    // A 5xx from a probe does not count either; a member's does.
    const probe500 = await scrape([
      { status: 500, ms: 2, n: 3, route: "/ready" },
      { status: 200, ms: 40, n: 5 },
    ]);
    expect(compareMetrics(probe500, old).ok).toBe(true);
    const member500 = await scrape([
      { status: 500, ms: 40, n: 1 },
      { status: 200, ms: 40, n: 5 },
    ]);
    expect(compareMetrics(member500, old).ok).toBe(false);
  });

  it("compares the old replica over the canary's window, not its whole life", async () => {
    // Its life: 10 000 fast requests; during the window: 100 at 300 ms. The canary at 500 ms is one bucket worse.
    const before = await scrape([{ status: 200, ms: 4, n: 10_000 }]);
    const after = await scrape([
      { status: 200, ms: 4, n: 10_000 },
      { status: 200, ms: 300, n: 100 },
    ]);
    const canary = await scrape([{ status: 200, ms: 500, n: 100 }]);
    expect(compareMetrics(canary, after).ok).toBe(false); // lifetime: p99 le=5 against le=500
    const windowed = compareMetrics(canary, after, before);
    expect(windowed.ok).toBe(true); // window: le=300 against le=500, one bucket
    expect(windowed.reason).toContain("vs old le=300");
  });

  it("a restarted old replica (counters went down) is judged on its later read alone", async () => {
    const before = await scrape([{ status: 200, ms: 4, n: 10_000 }]);
    const after = await scrape([{ status: 200, ms: 300, n: 100 }]);
    const canary = await scrape([{ status: 200, ms: 300, n: 100 }]);
    expect(compareMetrics(canary, after, before).reason).toContain("vs old le=300");
  });
});
