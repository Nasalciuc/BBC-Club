import { describe, it, expect } from "bun:test";
import { loadEnv, ServerEnv } from "@bbc/shared/env";
import { crmModule } from "../../src/module";
import type { EmailFacade } from "@bbc/email";

const email: EmailFacade = {
  async sendOtp() {},
  async sendOperatorRequest() {},
};

const base = {
  APP_ORIGIN: "http://localhost:8000",
  DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  INTERNAL_API_SECRET: "internal-secret-internal-secret-0000",
};
/** Made up for the test: 40 characters. */
const CRM_SECRET = "crm-secret-made-up-for-tests-0000000000";
const http = {
  ...base,
  CRM_ADAPTER: "http",
  CRM_API_URL: "https://crm.example.test/requests",
  CRM_API_SECRET: CRM_SECRET,
};

describe("CRM_ADAPTER via loadEnv", () => {
  it("defaults to mock and is part of ServerEnv", () => {
    expect(ServerEnv.shape.CRM_ADAPTER).toBeDefined();
    expect(loadEnv(base).CRM_ADAPTER).toBe("mock");
  });

  it("http needs CRM_API_URL and CRM_API_SECRET, and names each one missing (ADR-IMPL-065)", () => {
    expect(() => loadEnv({ ...base, CRM_ADAPTER: "http" })).toThrow(
      "CRM_ADAPTER=http: requires CRM_API_URL; requires CRM_API_SECRET (at least 32 characters)",
    );
    expect(() => loadEnv({ ...http, CRM_API_URL: undefined })).toThrow("CRM_ADAPTER=http: requires CRM_API_URL");
    expect(() => loadEnv({ ...http, CRM_API_SECRET: undefined })).toThrow(
      "CRM_ADAPTER=http: requires CRM_API_SECRET (at least 32 characters)",
    );
    const env = loadEnv(http);
    expect(env.CRM_ADAPTER).toBe("http");
    expect(env.CRM_API_URL).toBe("https://crm.example.test/requests");
  });

  it("a secret shorter than 32 characters is refused, and never printed", () => {
    const short = "too-short-made-up-secret";
    let message = "";
    try {
      loadEnv({ ...http, CRM_API_SECRET: short });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("CRM_API_SECRET");
    expect(message).not.toContain(short);
  });

  it("a secret left as the example file's comment is refused by name", () => {
    expect(() =>
      loadEnv({ ...http, CRM_API_SECRET: "# at least 32 characters; required when CRM_ADAPTER=http" }),
    ).toThrow(/^CRM_API_SECRET: the example file's comment/);
  });

  it("the address is https; http only to localhost, and never in production", () => {
    expect(() => loadEnv({ ...http, CRM_API_URL: "http://crm.example.test/requests" })).toThrow(
      "CRM_API_URL must be https (http only to localhost, outside production)",
    );
    for (const local of ["http://127.0.0.1:4010/requests", "http://localhost:4010/requests", "http://[::1]:4010/r"]) {
      expect(loadEnv({ ...http, CRM_API_URL: local }).CRM_API_URL).toBe(local);
    }
    expect(() =>
      loadEnv({
        ...http,
        NODE_ENV: "production",
        POSTMARK_SERVER_TOKEN: "postmark-made-up-token",
        CRM_API_URL: "http://127.0.0.1:4010/requests",
      }),
    ).toThrow("CRM_API_URL must be https");
    expect(() => loadEnv({ ...http, CRM_API_URL: "https://user:pass@crm.example.test/requests" })).toThrow(
      "CRM_API_URL must not carry credentials",
    );
  });

  it("crm module refuses http without the address and the secret (a host built without loadEnv)", () => {
    expect(() =>
      crmModule().init({
        db: {},
        platform: {},
        env: { CRM_ADAPTER: "http" },
        ports: { email },
      }),
    ).toThrow("CRM_API_URL and CRM_API_SECRET are required when CRM_ADAPTER=http");
  });

  it("crm module builds the http adapter from env; its findByEmail asks nothing and answers null", async () => {
    const out = await crmModule().init({
      db: {},
      platform: {},
      env: loadEnv({ ...http, CRM_API_URL: "http://127.0.0.1:9/requests" }),
      ports: { email },
    });
    if (!out.exposes) throw new Error("crm facade missing");
    // Port 9 (discard) is never asked: findByEmail makes no call.
    expect(await out.exposes.findByEmail("member@test.dev")).toBeNull();
  });

  it("crm module accepts mock from env", async () => {
    const out = await crmModule().init({
      db: {},
      platform: {},
      env: { CRM_ADAPTER: "mock" },
      ports: { email },
    });
    expect(out.exposes).toBeDefined();
    if (!out.exposes) throw new Error("crm facade missing");
    expect(await out.exposes.findByEmail("nobody@x.com")).toBeNull();
  });
});
