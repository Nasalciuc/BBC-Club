import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "../src/api";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-jobs-singleton", { max: 10 });
  db = iso.db;
});
afterAll(() => iso.drop());

describe("singleton jobs on a connection pool", () => {
  it("runs on every consecutive call, not just the first", async () => {
    const p = createPlatform(db, { level: "silent" });
    let runs = 0;
    p.jobs.register("single-seq", {
      singleton: true,
      handler: async () => {
        runs++;
      },
    });
    for (let i = 0; i < 12; i++) expect((await p.jobs.run("single-seq")).status).toBe("succeeded");
    expect(runs).toBe(12); // with the pooled bug this is 1 and eleven "skipped"
  });

  it("still refuses a truly concurrent second run", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.jobs.register("single-par", {
      singleton: true,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 300));
      },
    });
    const [a, b] = await Promise.all([p.jobs.run("single-par"), p.jobs.run("single-par")]);
    expect([a.status, b.status].sort()).toEqual(["skipped", "succeeded"]);
  });
});
