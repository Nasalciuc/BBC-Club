import { describe, expect, it } from "bun:test";
import { askEstimate, type EstimateUnavailable } from "../../src/application/estimate";

const answer = { amount: 2055, currency: "USD" as const, cabin: "business" as const, rules: "0123456789abcdef" };

function recorder() {
  const reasons: EstimateUnavailable[] = [];
  return { reasons, unavailable: (r: EstimateUnavailable) => reasons.push(r) };
}

describe("askEstimate — an estimate never decides whether a request is accepted", () => {
  it("passes the catalog's answer through, and its absence", async () => {
    const r = recorder();
    expect(await askEstimate(async () => answer, r)).toEqual(answer);
    expect(await askEstimate(async () => null, r)).toBeNull();
    expect(r.reasons).toEqual([]);
  });

  it("an error gives no estimate, reported as error — a rejection, or a throw before any promise", async () => {
    const r = recorder();
    expect(
      await askEstimate(async () => {
        throw new Error("catalog down");
      }, r),
    ).toBeNull();
    expect(
      await askEstimate(() => {
        throw new Error("no catalog");
      }, r),
    ).toBeNull();
    expect(r.reasons).toEqual(["error", "error"]);
  });

  it("a slow answer gives no estimate, reported as timeout — and its late failure surfaces nowhere", async () => {
    const r = recorder();
    const slow = () =>
      new Promise<typeof answer>((_, reject) => setTimeout(() => reject(new Error("late")), 30)) as Promise<
        typeof answer
      >;
    expect(await askEstimate(slow, { ...r, timeoutMs: 5 })).toBeNull();
    expect(r.reasons).toEqual(["timeout"]);
    await Bun.sleep(40); // the late rejection is handled: no unhandled rejection fails this test
  });

  it("an amount that is not a positive whole number of dollars gives no estimate (the column is an integer)", async () => {
    const r = recorder();
    expect(await askEstimate(async () => ({ ...answer, amount: 2055.5 }), r)).toBeNull();
    expect(await askEstimate(async () => ({ ...answer, amount: 0 }), r)).toBeNull();
    expect(r.reasons).toEqual(["invalid", "invalid"]);
  });
});
