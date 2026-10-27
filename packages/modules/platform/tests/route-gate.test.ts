/** ADR-IMPL-075: the route gate — one declaration per route, the same order everywhere (rate, permission, kill flags of
 *  every module the route reads), and the registry the inventory reads written from that declaration. */
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "@bbc/shared/http/app-env";
import type { Principal } from "@bbc/shared/authz/principal";
import { rateRuleRegistry, routeRegistry } from "@bbc/shared/authz/authorize";
import { routeGate } from "../src/ratelimit";

const member: Principal = { kind: "member", memberId: "m1", role: "member", sessionId: "s1", email: "m@test.dev" };

function setup(opts: { allowed?: boolean; killed?: string[]; principal?: Principal } = {}) {
  const steps: string[] = [];
  const limiter = {
    check: async (rule: string, subject: string) => {
      steps.push(`rate:${rule}:${subject}`);
      return { allowed: opts.allowed ?? true, remaining: 1, resetMs: 1000, limit: 2 };
    },
  };
  const flags = {
    isKilled: async (m: string) => {
      steps.push(`kill:${m}`);
      return (opts.killed ?? []).includes(m);
    },
  };
  const routes = new Hono<AppEnv>();
  routes.use("*", async (c, next) => {
    c.set("principal", opts.principal ?? member);
    c.set("clientIp", "203.0.113.9");
    await next();
  });
  const gate = routeGate({ rateLimit: limiter as never, flags, logger: { warn() {} } }, "catalog").on(routes, "/v1");
  gate.get("/gated/:id", { permission: "fares:read", rate: "read", reads: ["members", "proposals"] }, (c) => {
    steps.push(`handler:${c.req.param("id")}`);
    return c.json({ ok: true });
  });
  gate.post("/gated-own", { permission: "fares:read", rate: "profile.write", rateBy: "route" }, (c) =>
    c.json({ ok: true }),
  );
  return { routes, steps };
}

describe("routeGate", () => {
  it("registers each route once, with its permission and rule", () => {
    setup();
    expect(routeRegistry.get("GET /v1/gated/:id")).toBe("fares:read");
    expect(rateRuleRegistry.get("GET /v1/gated/:id")).toBe("read");
    expect(rateRuleRegistry.get("POST /v1/gated-own")).toBe("profile.write");
  });

  it("checks the rate, then the permission, then every module the route reads, then runs the handler", async () => {
    const { routes, steps } = setup();
    const res = await routes.request("/gated/42");
    expect(res.status).toBe(200);
    expect(steps).toEqual(["rate:read:m:m1", "kill:catalog", "kill:members", "kill:proposals", "handler:42"]);
  });

  it("a flood is refused before anything else is asked", async () => {
    const { routes, steps } = setup({ allowed: false });
    expect((await routes.request("/gated/1")).status).toBe(429);
    expect(steps).toEqual(["rate:read:m:m1"]);
  });

  it("anonymous: counted by address, then 401; a module the route reads killed: 503", async () => {
    const anon = setup({ principal: { kind: "anonymous" } });
    expect((await anon.routes.request("/gated/1")).status).toBe(401);
    expect(anon.steps).toEqual(["rate:read:ip:203.0.113.9"]);
    const killed = setup({ killed: ["proposals"] });
    expect((await killed.routes.request("/gated/1")).status).toBe(503);
    expect(killed.steps).not.toContain("handler:1");
  });

  it("rateBy route: the rule is registered, the route's own step counts it", async () => {
    const { routes, steps } = setup();
    expect((await routes.request("/gated-own", { method: "POST" })).status).toBe(200);
    expect(steps.some((s) => s.startsWith("rate:"))).toBe(false);
  });
});
