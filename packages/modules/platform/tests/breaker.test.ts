import { describe, expect, it } from "bun:test";
import { createBreaker } from "../src/redis/client";

describe("redis breaker", () => {
  it("serves the fallback and stays open without calling Redis again", async () => {
    const opened: string[] = [];
    const guarded = createBreaker({ inc: (name) => opened.push(name) });
    let calls = 0;
    const fn = async () => {
      calls += 1;
      throw new Error("down");
    };
    expect(await guarded(fn, async () => "fallback")).toBe("fallback");
    expect(await guarded(fn, async () => "fallback")).toBe("fallback");
    expect(calls).toBe(1);
    expect(opened).toEqual(["redis_breaker_open"]);
  });
});
