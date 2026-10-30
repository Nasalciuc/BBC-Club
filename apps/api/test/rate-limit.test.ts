import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { createRateLimiter } from "@bbc/platform/ratelimit";
import { rateLimit } from "../src/middleware/rate-limit";
import { errorContract } from "../src/middleware/error-contract";

const db = {
  execute: async () => {
    throw new Error("postgres down");
  },
} as never;

function withPrincipal(app: Hono<AppEnv>) {
  app.use("*", async (c, next) => {
    c.set("principal", { kind: "member", memberId: "m1", role: "member", sessionId: "s", email: "a@b.c" });
    c.set("clientIp", "203.0.113.8");
    c.set("requestId", "req");
    await next();
  });
}

describe("rate limit middleware", () => {
  it("21st search in a burst is 429 with Retry-After 1 and RateLimit headers", async () => {
    const limiter = createRateLimiter({ db, flags: { read: async () => null }, metrics: { inc() {} } });
    const app = new Hono<AppEnv>();
    withPrincipal(app);
    app.get("/v1/search", rateLimit(limiter, "search"), (c) => c.json({ ok: true }));
    let last = new Response();
    for (let i = 0; i < 21; i++) last = await app.request("/v1/search");
    expect(last.status).toBe(429);
    expect(last.headers.get("Retry-After")).toBe("1");
    expect(last.headers.get("RateLimit-Limit")).toBe("60");
    expect(last.headers.get("RateLimit-Remaining")).toBe("0");
    expect(last.headers.get("RateLimit-Reset")).toBeTruthy();
    const first = await app.request("/v1/search");
    expect(first.headers.get("RateLimit-Limit")).toBe("60");
  });

  it("a closed rule whose store throws is 503, never 200", async () => {
    const limiter = createRateLimiter({ db, flags: { read: async () => null }, metrics: { inc() {} } });
    const app = new Hono<AppEnv>();
    withPrincipal(app);
    app.post("/v1/requests", rateLimit(limiter, "requests.submit"), (c) => c.json({ ok: true }));
    const res = await app.request("/v1/requests", { method: "POST" });
    expect(res.status).toBe(503);
    // The limiter cannot answer: the process is behind, the route is not off (ADR-IMPL-080).
    expect(res.headers.get("Retry-After")).toBe("5");
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("OVERLOADED");
  });

  it("a closed rule counted inside a route, its store down, answers OVERLOADED through the error contract", async () => {
    // requests.submit counts inside its own transaction (ADR-IMPL-071): the limiter's error leaves the route, and the
    // error contract answers it — the process is behind, the route is not off (ADR-IMPL-080).
    const limiter = createRateLimiter({ db, flags: { read: async () => null }, metrics: { inc() {} } });
    const codes: string[] = [];
    const app = new Hono<AppEnv>();
    app.onError(errorContract({ error() {}, warn() {} }, { inc: (_n, l) => void codes.push(l?.code ?? "") }));
    withPrincipal(app);
    app.post("/v1/requests", async (c) => {
      await limiter.check("requests.submit", "m1");
      return c.json({ ok: true });
    });
    const res = await app.request("/v1/requests", { method: "POST" });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("5");
    const body = (await res.json()) as { error: { code: string; requestId?: string } };
    expect(body.error.code).toBe("OVERLOADED");
    expect(body.error.requestId).toBe("req");
    expect(codes).toEqual(["OVERLOADED"]);
  });
});
