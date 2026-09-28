/** APP_ROLE: API processes do not run jobs; the worker does not serve members. */
import { describe, it, expect } from "bun:test";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { loadEnv } from "@bbc/shared/env";
import { buildApp } from "../src/index";
import { testApp } from "./helpers/test-app";

const secrets = {
  APP_ORIGIN: "http://localhost:8000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  INTERNAL_API_SECRET: "internal-secret-internal-secret-0000",
};

describe("APP_ROLE", () => {
  it("api does not start the poller and answers 404 on job HTTP", async () => {
    const iso = await isolatedDb("role-api", { max: 4 });
    const env = loadEnv({ ...process.env, ...secrets, DATABASE_URL: iso.url, APP_ROLE: "api" });
    const built = await buildApp({ env, db: iso.db, startPoller: true, role: "api" });
    await Bun.sleep(30);
    expect(built.platform.poller.isRunning()).toBe(false);
    const job = await built.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET },
    });
    expect(job.status).toBe(404);
    await built.shutdown();
    await iso.drop();
  });

  it("worker does not serve members and still runs jobs", async () => {
    const iso = await isolatedDb("role-worker", { max: 4 });
    const env = loadEnv({ ...process.env, ...secrets, DATABASE_URL: iso.url, APP_ROLE: "worker" });
    const built = await buildApp({ env, db: iso.db, startPoller: false, role: "worker" });
    expect((await built.app.request("/v1/home")).status).toBe(404);
    expect((await built.app.request("/health")).status).toBe(200);
    expect((await built.app.request("/v1/internal/db-report")).status).toBe(401);
    const job = await built.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET },
    });
    expect(job.status).not.toBe(404);
    await built.shutdown();
    await iso.drop();
  });

  it("testApp inventories still boot as all", async () => {
    const t = await testApp({ suite: "role-all" });
    expect(
      (
        await t.app.request("/v1/internal/run/dispatch", {
          method: "POST",
          headers: { "X-Internal-Secret": t.internalSecret },
        })
      ).status,
    ).toBe(200);
    await t.close();
  });
});

describe("LOADTEST env", () => {
  it("refuses LOADTEST=1 in production", () => {
    expect(() =>
      loadEnv({
        ...secrets,
        DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
        NODE_ENV: "production",
        APP_ORIGIN: "https://api.example.com",
        POSTMARK_SERVER_TOKEN: "pm-test-token-xxxxxxxx",
        LOADTEST: "1",
      }),
    ).toThrow(/LOADTEST=1/);
  });

  it("refuses extra trusted proxies without LOADTEST=1", () => {
    expect(() =>
      loadEnv({
        ...secrets,
        DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
        LOADTEST_TRUSTED_PROXIES: "10.0.0.1",
      }),
    ).toThrow(/LOADTEST_TRUSTED_PROXIES/);
  });

  it("accepts empty OPS_WEBHOOK from env files", () => {
    const env = loadEnv({
      ...secrets,
      DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
      OPS_WEBHOOK: "",
    });
    expect(env.OPS_WEBHOOK).toBe("");
  });
});
