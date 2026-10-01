import { describe, expect, it } from "bun:test";
import { SHARDS, shardOf } from "../src/jobs/streams";

describe("push stream shards", () => {
  it("stays inside the eight shards and is stable for an id", () => {
    const id = "6f0c1c2e-3b4a-4d5e-8f90-a1b2c3d4e5f6";
    const shard = shardOf(id);
    expect(shard).toBe(shardOf(id));
    const n = Number(shard.slice("jobs:push:{".length, -1));
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThan(SHARDS);
  });
});
