import { expect, it } from "bun:test";
import { recordSearch } from "../../src/application/demand";

const event = {
  from: "JFK",
  to: "LHR",
  cabin: "business" as const,
  month: "2026-11",
  hadFares: false,
  results: 0,
};

it("counts a search on the UTC day it happened", async () => {
  const routes: string[] = [];
  await recordSearch(
    {
      topK: {
        reserve: async () => undefined,
        incrBy: async (key) => {
          routes.push(key);
        },
        listWithCount: async () => [],
      },
      cms: {
        initByProb: async () => undefined,
        incrBy: async () => undefined,
        query: async () => [],
      },
    },
    { ...event, at: "2026-10-01T23:59:00.000Z" },
  );
  expect(routes).toEqual(["demand:2026-10-01:routes"]);
});
