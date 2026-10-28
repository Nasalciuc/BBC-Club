/** ADR-IMPL-080: a killed module answers SERVICE_DISABLED; flags this process cannot trust answer OVERLOADED with
 *  Retry-After — the module is not off, the process is behind. */
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { authorize } from "./authorize";

type State = "killed" | "live" | "unknown";
function app(flags: NonNullable<Parameters<typeof authorize>[1]>["flags"]) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("principal", { kind: "member", memberId: "m1", role: "member", sessionId: "s", email: "a@b.c" } as never);
    await next();
  });
  a.get("/v1/requests", authorize("proposals:read", { modules: ["requests", "catalog"], flags }), (c) =>
    c.json({ ok: true }),
  );
  return a;
}
const states = (s: Record<string, State>) => ({
  isKilled: async (m: string) => s[m] !== "live",
  killedState: async (m: string) => s[m] ?? "live",
});

describe("authorize and the kill flags (ADR-IMPL-080)", () => {
  it("a module killed: 503 SERVICE_DISABLED, without Retry-After", async () => {
    const res = await app(states({ requests: "killed", catalog: "live" })).request("/v1/requests");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SERVICE_DISABLED");
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("flags this process cannot trust: 503 OVERLOADED with Retry-After 5", async () => {
    const res = await app(states({ requests: "live", catalog: "unknown" })).request("/v1/requests");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("OVERLOADED");
    expect(res.headers.get("Retry-After")).toBe("5");
  });

  it("killed wins over unknown", async () => {
    const res = await app(states({ requests: "killed", catalog: "unknown" })).request("/v1/requests");
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SERVICE_DISABLED");
  });

  it("every module live: the route runs", async () => {
    const res = await app(states({ requests: "live", catalog: "live" })).request("/v1/requests");
    expect(res.status).toBe(200);
  });

  it("flags without killedState keep isKilled's verdict", async () => {
    const res = await app({ isKilled: async (m) => m === "catalog" }).request("/v1/requests");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SERVICE_DISABLED");
  });
});
