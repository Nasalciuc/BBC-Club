import { describe, expect, it } from "bun:test";
import { retryUntilCommitted } from "../src/kafka/consume";

describe("kafka retry", () => {
  it("runs the effect once and commits once after two failures", async () => {
    let effects = 0;
    let commits = 0;
    const outcome = await retryUntilCommitted({
      signal: new AbortController().signal,
      apply: async () => {
        effects += 1;
        if (effects < 3) throw new Error("broker");
      },
      commit: async () => {
        commits += 1;
      },
      onFailure: () => undefined,
      sleep: async () => true,
    });
    expect(outcome).toBe("ok");
    expect(effects).toBe(3);
    expect(commits).toBe(1);
  });

  it("returns during backoff when the signal aborts", async () => {
    const ac = new AbortController();
    let commits = 0;
    const outcome = await retryUntilCommitted({
      signal: ac.signal,
      apply: async () => {
        throw new Error("broker");
      },
      commit: async () => {
        commits += 1;
      },
      onFailure: () => ac.abort(),
      sleep: async (_ms, signal) => !signal.aborted,
    });
    expect(outcome).toBe("aborted");
    expect(commits).toBe(0);
  });
});
