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

  it("in production the address is public: never this machine, a private network or a link (no SSRF inside)", () => {
    const production = { ...http, NODE_ENV: "production", POSTMARK_SERVER_TOKEN: "postmark-made-up-token" };
    const internal = [
      "https://169.254.169.254/latest/meta-data", // a cloud's metadata service
      "https://127.0.0.1:8001/v1/internal/run/send-requests",
      "https://127.1.2.3/requests",
      "https://2130706433/requests", // 127.0.0.1 written as a number
      "https://0x7f.1/requests", // and in hex
      "https://0.0.0.0/requests",
      "https://localhost/requests",
      "https://LOCALHOST./requests",
      "https://crm.localhost/requests",
      "https://10.0.0.5/requests",
      "https://172.16.0.1/requests",
      "https://172.31.255.255/requests",
      "https://192.168.1.10/requests",
      "https://100.64.0.1/requests",
      "https://[::1]/requests",
      "https://[::]/requests",
      "https://[fd12:3456::1]/requests",
      "https://[fe80::1]/requests",
      "https://[::ffff:127.0.0.1]/requests",
      "https://[::ffff:169.254.169.254]/requests",
    ];
    for (const address of internal) {
      let message = "";
      try {
        loadEnv({ ...production, CRM_API_URL: address });
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect({ address, message }).toEqual({
        address,
        message:
          "CRM_ADAPTER=http: CRM_API_URL must be a public address in production (not loopback, private or link-local)",
      });
    }
    // Public addresses, including those that only look near a private range.
    for (const address of [
      "https://crm.example.test/requests",
      "https://8.8.8.8/requests",
      "https://172.32.0.1/requests",
      "https://100.128.0.1/requests",
      "https://169.255.0.1/requests",
      "https://192.169.0.1/requests",
      "https://[2001:db8::1]/requests",
      "https://[::ffff:8.8.8.8]/requests",
    ]) {
      expect(loadEnv({ ...production, CRM_API_URL: address }).CRM_API_URL).toBe(address);
    }
    // Outside production a test's fake CRM may still listen on this machine, over https too.
    expect(loadEnv({ ...http, CRM_API_URL: "https://127.0.0.1:4010/requests" }).CRM_API_URL).toBe(
      "https://127.0.0.1:4010/requests",
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
