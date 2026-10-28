/** Point-in-time gauges must still be on the second scrape. A clear() inside render flaps every reader. */
import { describe, expect, it } from "bun:test";
import { createMetrics } from "../src/telemetry/metrics";

describe("metrics render", () => {
  it("db gauges survive a second scrape", async () => {
    const m = createMetrics();
    m.setGauge("db_connections", 3, { app: "bbc-api", state: "active" });
    const first = await m.render();
    const second = await m.render();
    expect(first).toContain("bbc_db_connections");
    expect(second).toContain("bbc_db_connections");
  });

  it("300 ms is its own bucket; 301 ms is the next one", async () => {
    const at300 = createMetrics();
    at300.observe("http_duration_ms", 300, { route: "/v1/home" });
    const text300 = await at300.render();
    expect(bucket(text300, "200")).toBe(0);
    expect(bucket(text300, "300")).toBe(1);

    const at301 = createMetrics();
    at301.observe("http_duration_ms", 301, { route: "/v1/home" });
    const text301 = await at301.render();
    expect(bucket(text301, "300")).toBe(0);
    expect(bucket(text301, "500")).toBe(1);
  });

  it("each family is written once, its TYPE line before its samples (ADR-IMPL-073)", async () => {
    const m = createMetrics();
    m.inc("http_requests", { route: "/v1/home", status: "200" });
    m.inc("cache_hit", { ns: "catalog" });
    m.inc("http_requests", { route: "/v1/fares/:id", status: "200" });
    m.setGauge("db_lock_waits", 0);
    m.gauge("queue_pending", () => 3);
    const lines = (await m.render()).trim().split("\n");
    expect(lines.filter((l) => l.startsWith("# TYPE")).sort()).toEqual([
      "# TYPE bbc_cache_hit counter",
      "# TYPE bbc_db_lock_waits gauge",
      "# TYPE bbc_http_requests counter",
      "# TYPE bbc_queue_pending gauge",
    ]);
    const type = lines.indexOf("# TYPE bbc_http_requests counter");
    expect(lines[type + 1]).toStartWith("bbc_http_requests{");
    expect(lines[type + 2]).toStartWith("bbc_http_requests{");
  });

  it("a histogram ends with its +Inf bucket, which equals its count", async () => {
    const m = createMetrics();
    m.observe("http_duration_ms", 12, { route: "/v1/home" });
    m.observe("http_duration_ms", 45_000, { route: "/v1/home" });
    const text = await m.render();
    expect(text).toContain("# TYPE bbc_http_duration_ms histogram");
    expect(bucket(text, "+Inf")).toBe(2);
    expect(bucket(text, "30000")).toBe(1);
    expect(text).toContain('bbc_http_duration_ms_count{route="/v1/home"} 2');
    expect(text).toContain('bbc_http_duration_ms_sum{route="/v1/home"} 45012');
    const bare = createMetrics();
    bare.observe("job_wait_ms", 7);
    expect(await bare.render()).toContain("bbc_job_wait_ms_count 1\n");
  });

  it("a label value is escaped as the text format asks", async () => {
    const m = createMetrics();
    m.inc("odd", { v: 'a"b\\c\nd' });
    expect(await m.render()).toContain('bbc_odd{v="a\\"b\\\\c\\nd"} 1');
  });

  it("a total another system keeps is a counter, set as read, and a refresh can drop it", async () => {
    const m = createMetrics();
    m.setCounter("pgbouncer_binds_total", 41);
    m.setCounter("pgbouncer_binds_total", 42);
    let text = await m.render();
    expect(text).toContain("# TYPE bbc_pgbouncer_binds_total counter");
    expect(text).toContain("bbc_pgbouncer_binds_total 42");
    m.clearPrefix("pgbouncer_binds_total");
    text = await m.render();
    expect(text).not.toContain("pgbouncer_binds_total");
  });
});

function bucket(text: string, le: string): number {
  const line = text.split("\n").find((l) => l.includes(`le="${le}"`));
  return Number(line?.split(" ").at(-1));
}
