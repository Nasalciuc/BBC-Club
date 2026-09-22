/**
 * GET /metrics stays public at the app because Caddy `@ops` already 404s remote clients
 * (infra/caddy/Caddyfile L17–22); RUNBOOK curls localhost; Kuma scrapes /health and /ready, not /metrics.
 */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("GET /metrics", () => {
  it("is reachable without auth and leaks neither emails nor member ids", async () => {
    const t = await testApp({ suite: "metrics" });
    const r = await t.app.request("/metrics");
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).not.toContain("@");
    expect(body).not.toContain(t.memberA.id);
    expect(body).not.toContain(t.memberB.id);
    await t.close();
  });
});
