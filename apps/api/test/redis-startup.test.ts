import { expect, test } from "bun:test";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { loadEnv } from "@bbc/shared/env";
import type { CatalogFacade } from "@bbc/catalog";
import { buildApp } from "../src/index";

test("REDIS_URL on a closed port still answers /health and destinations from Postgres", async () => {
  const iso = await isolatedDb("redis-closed", { max: 4 });
  const env = loadEnv({
    ...process.env,
    DATABASE_URL: iso.url,
    CORS_ORIGINS: "",
    REDIS_URL: "redis://127.0.0.1:1",
  });
  const started = performance.now();
  const built = await buildApp({ env, db: iso.db, startPoller: false });
  try {
    const health = await built.app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    expect(performance.now() - started).toBeLessThan(5_000);
    const pins = await built.registry.facade<CatalogFacade>("catalog").destinations(undefined, "JFK");
    expect(Array.isArray(pins)).toBe(true);
  } finally {
    await built.shutdown();
    await iso.drop();
  }
});
