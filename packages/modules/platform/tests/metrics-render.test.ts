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
});

function bucket(text: string, le: string): number {
  const line = text.split("\n").find((l) => l.includes(`le="${le}"`));
  return Number(line?.split(" ").at(-1));
}
