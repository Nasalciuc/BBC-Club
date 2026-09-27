import { describe, expect, it } from "bun:test";
import { loadEnv } from "@bbc/shared/env";

const base = {
  APP_ORIGIN: "http://localhost:8000",
  DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  INTERNAL_API_SECRET: "internal-secret-internal-secret-0000",
  POSTMARK_SERVER_TOKEN: "postmark-token",
};

describe("PUSH_ADAPTER", () => {
  it("names the missing key when live", () => {
    expect(() => loadEnv({ ...base, PUSH_ADAPTER: "live", APNS_KEY_ID: "K" })).toThrow(/APNS_P8_BASE64/);
  });

  it("stays recording outside production", () => {
    expect(loadEnv(base).PUSH_ADAPTER).toBe("recording");
  });

  it("boots production on the recording default", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production" });
    expect(env.PUSH_ADAPTER).toBe("recording");
  });
});
