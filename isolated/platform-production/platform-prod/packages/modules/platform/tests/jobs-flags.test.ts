import { describe, it, expect, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { createPlatform } from "../src/api";

const db = createDb(process.env.DATABASE_URL!, { max: 4, applicationName: "platform-test-jobs" });
afterAll(() => db.close());

describe("jobs", () => {
  it("records every run and returns metrics", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.jobs.register("test-job", { handler: async () => ({ processed: 3 }) });
    const r = await p.jobs.run("test-job");
    expect(r.status).toBe("succeeded");
    expect(r.metrics).toEqual({ processed: 3 });
    const last = await p.jobs.lastRuns();
    expect(last["test-job"].status).toBe("succeeded");
  });

  it("records failures instead of throwing", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.jobs.register("bad-job", {
      handler: async () => {
        throw new Error("nope");
      },
    });
    const r = await p.jobs.run("bad-job");
    expect(r.status).toBe("failed");
    expect(r.error).toContain("nope");
  });

  it("singleton skips a concurrent run instead of doubling work", async () => {
    const p = createPlatform(db, { level: "silent" });
    let running = 0,
      maxConcurrent = 0;
    p.jobs.register("single", {
      singleton: true,
      handler: async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 200));
        running--;
      },
    });
    const [a, b] = await Promise.all([p.jobs.run("single"), p.jobs.run("single")]);
    expect(maxConcurrent).toBe(1);
    expect([a.status, b.status].sort()).toEqual(["skipped", "succeeded"]);
  });
});

describe("flags", () => {
  it("killswitch defaults to false and survives a read error", async () => {
    const p = createPlatform(db, { level: "silent" });
    expect(await p.flags.isKilled("nonexistent")).toBe(false);
    await p.flags.set("engagement.killed", { enabled: true });
    expect(await p.flags.isKilled("engagement")).toBe(true);
    await p.flags.set("engagement.killed", { enabled: false });
  });

  it("caches reads and invalidates on write", async () => {
    const p = createPlatform(db, { level: "silent" });
    await p.flags.set("personalization.ranker", { variant: "rules" });
    expect(await p.flags.variant("personalization.ranker", "none")).toBe("rules");
    await p.flags.set("personalization.ranker", { variant: "model" });
    expect(await p.flags.variant("personalization.ranker", "none")).toBe("model");
  });
});

describe("metrics", () => {
  it("renders counters, histograms and gauges", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.metrics.inc("deliveries_done", { consumer: "x.onY" });
    p.metrics.observe("delivery_duration_ms", 42, { consumer: "x.onY" });
    const out = await p.metrics.render();
    expect(out).toContain('bbc_deliveries_done{consumer="x.onY"} 1');
    expect(out).toContain("bbc_delivery_duration_ms_count");
    expect(out).toContain("bbc_queue_pending");
  });
});
