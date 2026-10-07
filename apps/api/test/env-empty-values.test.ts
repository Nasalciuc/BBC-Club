import { describe, expect, it } from "bun:test";
import { loadEnv, withoutRejectedEmptyValues } from "@bbc/shared/env";

const base = {
  DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  INTERNAL_API_SECRET: "internal-secret-internal-secret-0000",
  APP_ORIGIN: "http://localhost:8081",
};

describe("empty environment values", () => {
  it("count as unset: an empty optional email no longer stops the server", () => {
    const env = loadEnv({ ...base, REVIEW_ACCOUNT_EMAIL: "", REVIEW_ACCOUNT_PASSWORD: "" });
    expect(env.REVIEW_ACCOUNT_EMAIL).toBeUndefined();
    expect(env.REVIEW_ACCOUNT_PASSWORD).toBeUndefined();
  });

  it("fall back to the default, as if the line were absent", () => {
    expect(loadEnv({ ...base, CRM_ADAPTER: "" }).CRM_ADAPTER).toBe("mock");
  });

  it("still reject a value that is set but wrong", () => {
    expect(() => loadEnv({ ...base, REVIEW_ACCOUNT_EMAIL: "not-an-email" })).toThrow("REVIEW_ACCOUNT_EMAIL");
  });

  it("keep an empty value the schema accepts, exactly as written", () => {
    const env = loadEnv({ ...base, OPS_WEBHOOK: "", CORS_ORIGINS: "" });
    expect(env.OPS_WEBHOOK).toBe("");
    expect(env.CORS_ORIGINS).toBe("");
  });

  it("drop only the empty values the schema rejects", () => {
    const out = withoutRejectedEmptyValues({ REVIEW_ACCOUNT_EMAIL: "", OPS_WEBHOOK: "", UNKNOWN_VAR: "", B: "x" });
    expect(out).toEqual({ OPS_WEBHOOK: "", UNKNOWN_VAR: "", B: "x" });
  });
});
