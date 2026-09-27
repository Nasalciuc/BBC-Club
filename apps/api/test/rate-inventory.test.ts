import { describe, expect, it } from "bun:test";
import { rateRuleRegistry, routeRegistry } from "../src/middleware/authorize";
import { testApp } from "./helpers/test-app";

describe("rate limit inventory", () => {
  it("every member GET is read or search, and no internal route is limited", async () => {
    const t = await testApp({ suite: "rate-inventory" });
    for (const [key, permission] of routeRegistry) {
      const [method, path] = key.split(" ");
      const rule = rateRuleRegistry.get(key);
      if (path?.startsWith("/v1/internal")) {
        expect(rule).toBeUndefined();
        continue;
      }
      if (method === "GET" && permission !== "public" && path?.startsWith("/v1/")) {
        expect(rule === "read" || rule === "search").toBe(true);
      }
    }
    expect(rateRuleRegistry.get("GET /v1/app-config")).toBe("anon");
    expect(rateRuleRegistry.get("GET /v1/test/last-otp")).toBeUndefined();
    expect(rateRuleRegistry.get("PATCH /v1/profile")).toBe("profile.write");
    expect(rateRuleRegistry.get("PUT /v1/profile/travel")).toBe("profile.write");
    expect(rateRuleRegistry.get("PUT /v1/profile/preferences")).toBe("profile.write");
    expect(rateRuleRegistry.get("POST /v1/devices")).toBe("devices.register");
    expect(rateRuleRegistry.get("GET /health")).toBeUndefined();
    expect(rateRuleRegistry.get("GET /ready")).toBeUndefined();
    expect(rateRuleRegistry.get("GET /metrics")).toBeUndefined();
    await t.close();
  });
});
