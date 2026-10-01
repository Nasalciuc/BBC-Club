import { expect, it } from "bun:test";
import { createSearchBuffer } from "../src/search/buffer";

const event = {
  from: "JFK",
  to: "LHR",
  cabin: "business" as const,
  month: "2026-11",
  hadFares: false,
  results: 0,
};

it("does not fill the buffer when there is no producer", async () => {
  let dropped = 0;
  const buffer = createSearchBuffer({
    producer: null,
    flags: { isEnabled: async () => true },
    metrics: {
      inc(name) {
        if (name === "search_events_dropped") dropped += 1;
      },
    },
    logger: { warn() {} },
  });
  const ac = new AbortController();
  buffer.start(ac.signal);
  await Bun.sleep(1_100);
  for (let i = 0; i < 10_001; i++) buffer.note(event);
  ac.abort();
  expect(dropped).toBe(0);
});
