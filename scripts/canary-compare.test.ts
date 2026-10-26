import { describe, expect, it } from "bun:test";
import { createMetrics } from "../packages/modules/platform/src/telemetry/metrics";
import { compareMetrics } from "./canary-compare";

async function scrape(rows: { status: number; ms: number; n: number }[]): Promise<string> {
  const m = createMetrics();
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      m.inc("http_requests", { route: "/v1/home", status: String(row.status) });
      m.observe("http_duration_ms", row.ms, { route: "/v1/home" });
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

  it("fails when the canary p99 is two buckets above the old replica", async () => {
    const old = await scrape([{ status: 200, ms: 100, n: 100 }]);
    const canary = await scrape([{ status: 200, ms: 200, n: 100 }]);
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
});
