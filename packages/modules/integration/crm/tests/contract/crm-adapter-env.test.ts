import { describe, it, expect } from "bun:test";
import { loadEnv, ServerEnv } from "@bbc/shared/env";
import { crmModule } from "../../src/module";

describe("CRM_ADAPTER via loadEnv", () => {
  it("defaults to mock and is part of ServerEnv", () => {
    expect(ServerEnv.shape.CRM_ADAPTER).toBeDefined();
    const env = loadEnv({
      APP_ORIGIN: "http://localhost:8000",
      DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
      INTERNAL_API_SECRET: "internal-secret-internal-secret-0000",
    });
    expect(env.CRM_ADAPTER).toBe("mock");
  });

  it("crm module refuses http adapter without override", () => {
    expect(() =>
      crmModule().init({
        db: {},
        platform: {},
        env: { CRM_ADAPTER: "http" },
        ports: {},
      }),
    ).toThrow(/stage 5/);
  });

  it("crm module accepts mock from env", async () => {
    const out = await crmModule().init({
      db: {},
      platform: {},
      env: { CRM_ADAPTER: "mock" },
      ports: {},
    });
    expect(out.exposes).toBeDefined();
    expect(await out.exposes!.findByEmail("nobody@x.com")).toBeNull();
  });
});
