import { describe, it, expect } from "bun:test";
import { authOrigins, loadEnv } from "@bbc/shared/env";

const SECRETS = {
  DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  INTERNAL_API_SECRET: "internal-secret-internal-secret-0000",
  POSTMARK_SERVER_TOKEN: "pm-test-token-xxxxxxxx",
} as const;

describe("CORS_ORIGINS via loadEnv", () => {
  it("production rejects a loopback extra and boots with a public https extra", () => {
    expect(() =>
      loadEnv({
        ...SECRETS,
        NODE_ENV: "production",
        APP_ORIGIN: "https://api.buybusinessclass.club",
        CORS_ORIGINS: "http://localhost:8081",
      }),
    ).toThrow(/insecure origin/);

    expect(() =>
      loadEnv({
        ...SECRETS,
        NODE_ENV: "production",
        APP_ORIGIN: "https://api.buybusinessclass.club",
        CORS_ORIGINS: "http://10.0.0.8:8081",
      }),
    ).toThrow(/insecure origin/);

    const env = loadEnv({
      ...SECRETS,
      NODE_ENV: "production",
      APP_ORIGIN: "https://api.buybusinessclass.club",
      CORS_ORIGINS: "https://ops.buybusinessclass.club",
    });
    expect(authOrigins(env)).toEqual([
      "https://api.buybusinessclass.club",
      "bbcclub://",
      "https://ops.buybusinessclass.club",
    ]);
  });

  it("development keeps Metro extras on the same list CORS and Better Auth use", () => {
    const env = loadEnv({
      ...SECRETS,
      NODE_ENV: "development",
      APP_ORIGIN: "http://localhost:8000",
      CORS_ORIGINS: "http://localhost:8081,http://127.0.0.1:8081",
    });
    expect(authOrigins(env)).toEqual([
      "http://localhost:8000",
      "bbcclub://",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
    ]);
  });
});
