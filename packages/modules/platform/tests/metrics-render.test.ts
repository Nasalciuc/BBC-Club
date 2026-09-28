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
});
