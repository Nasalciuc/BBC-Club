import { expect, it } from "bun:test";
import { createFlags } from "../src/flags";
import type { Cache } from "../src/cache";
import type { Executor } from "@bbc/db";

function countingDb() {
  let selects = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selects += 1;
            return [{ value: { enabled: true } }];
          },
        }),
      }),
    }),
  };
  return { db: db as unknown as Executor, reads: () => selects };
}

it("keeps a redis miss off postgres for the local window", async () => {
  const { db, reads } = countingDb();
  const cache = {
    getOrLoad: async (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
    invalidate: async () => undefined,
    bump: async () => undefined,
    generation: async () => null,
  } as unknown as Cache;
  const flags = createFlags(db, { cache });
  for (let i = 0; i < 100; i++) {
    expect(await flags.isEnabled("catalog.search_events")).toBe(true);
  }
  expect(reads()).toBe(1);
  expect(await flags.isKilled("catalog")).toBe(true);
  expect(await flags.isKilled("catalog")).toBe(true);
  expect(reads()).toBe(3);
});
