import { expect, it } from "bun:test";
import { runWorker } from "../src/jobs/streams";
import type { Redis } from "../src/redis/client";

it("retries group creation and then handles a message", async () => {
  let creates = 0;
  let handled = 0;
  const ac = new AbortController();
  const redis = {
    xGroupCreate: async () => {
      creates += 1;
      if (creates === 1) throw new Error("connection refused");
    },
    xAutoClaim: async () => ({ messages: [] }),
    xReadGroup: async () => [{ name: "jobs:push:{0}", messages: [{ id: "1-0", message: { id: "job-1" } }] }],
    xAck: async () => 1,
  } as unknown as Redis;

  await runWorker({
    redis,
    group: "push",
    consumer: "test",
    count: 10,
    minIdleMs: 1_000,
    signal: ac.signal,
    handle: async (ids) => {
      handled += 1;
      expect(ids).toEqual(["job-1"]);
      ac.abort();
    },
  });

  expect(handled).toBe(1);
  expect(creates).toBeGreaterThan(1);
});
