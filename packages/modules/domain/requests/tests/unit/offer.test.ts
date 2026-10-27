/** askOffer: whether the member could have seen the offer a request names, from proposals' verdict — and never a
 *  refusal for a read that failed. The verdict's own rules are proposals' (tests/contract/verdict). */
import { describe, expect, it } from "bun:test";
import type { OfferRow, OfferVerdict } from "@bbc/proposals";
import type { AskFailure } from "../../src/application/ask-within";
import { askOffer } from "../../src/application/offer";

const row = {} as OfferRow;
const ask = (v: OfferVerdict) => askOffer(async () => v, { unavailable: () => undefined });

describe("askOffer", () => {
  it("visible now, or gone since and it was theirs: ok; someone else's or not yet published: not_yours", async () => {
    expect(await ask({ kind: "visible", offer: row })).toBe("ok");
    expect(await ask({ kind: "gone", offer: row })).toBe("ok");
    expect(await ask({ kind: "not_yours" })).toBe("not_yours");
    expect(await ask({ kind: "missing" })).toBe("missing");
  });

  it("a read that fails or is slow checks nothing (null), reported by reason", async () => {
    const reasons: AskFailure[] = [];
    const failing = await askOffer(
      async () => {
        throw new Error("proposals down");
      },
      { unavailable: (r) => reasons.push(r) },
    );
    const slow = await askOffer(() => new Promise((resolve) => setTimeout(() => resolve({ kind: "missing" }), 50)), {
      timeoutMs: 5,
      unavailable: (r) => reasons.push(r),
    });
    expect([failing, slow]).toEqual([null, null]);
    expect(reasons).toEqual(["error", "timeout"]);
    await Bun.sleep(60);
  });
});
