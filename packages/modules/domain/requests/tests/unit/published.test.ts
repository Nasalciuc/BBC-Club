import { describe, expect, it } from "bun:test";
import type { AskFailure } from "../../src/application/ask-within";
import { askPublished, publishedAtRequest, type FarePrices } from "../../src/application/published";

const fare: FarePrices = {
  price: "4200.00",
  publishedPrice: "7850.00",
  publishedSource: "BA published · 16 Sep",
  currency: "USD",
};

function recorder() {
  const reasons: AskFailure[] = [];
  return { reasons, unavailable: (r: AskFailure) => reasons.push(r) };
}

describe("publishedAtRequest — what a fare request records of its fare's published price (ADR-IMPL-046)", () => {
  it("records the published price and its source for the price the app sent", () => {
    expect(publishedAtRequest(fare, 4200)).toEqual({ amount: 7850, source: "BA published · 16 Sep" });
    // Compared in cents: the catalog holds "4199.99", the app sends what it parsed.
    expect(publishedAtRequest({ ...fare, price: "4199.99" }, 4199.99)).toEqual({
      amount: 7850,
      source: "BA published · 16 Sep",
    });
    expect(publishedAtRequest(fare, 4200.004)).toEqual({ amount: 7850, source: "BA published · 16 Sep" });
  });

  it("records nothing for a fare re-priced since the member opened it", () => {
    expect(publishedAtRequest(fare, 4100)).toBeNull();
    expect(publishedAtRequest({ ...fare, price: "4300.00" }, 4200)).toBeNull();
  });

  it("never a struck price without its source, nor one the request cannot show", () => {
    expect(publishedAtRequest({ ...fare, publishedPrice: null }, 4200)).toBeNull();
    expect(publishedAtRequest({ ...fare, publishedSource: null }, 4200)).toBeNull();
    expect(publishedAtRequest({ ...fare, publishedSource: "  " }, 4200)).toBeNull();
    expect(publishedAtRequest({ ...fare, currency: "EUR" }, 4200)).toBeNull();
    expect(publishedAtRequest({ ...fare, publishedPrice: "0" }, 4200)).toBeNull();
    expect(publishedAtRequest(null, 4200)).toBeNull();
    expect(publishedAtRequest(fare, undefined)).toBeNull();
  });

  it("keeps the source as the catalog wrote it, without the spaces around it", () => {
    expect(publishedAtRequest({ ...fare, publishedSource: " Sabre · 16 Sep " }, 4200)?.source).toBe("Sabre · 16 Sep");
  });
});

describe("askPublished — the published price never decides whether a request is accepted", () => {
  it("passes the fare through, and its absence", async () => {
    const r = recorder();
    expect(await askPublished(async () => fare, 4200, r)).toEqual({ amount: 7850, source: "BA published · 16 Sep" });
    expect(await askPublished(async () => null, 4200, r)).toBeNull();
    expect(r.reasons).toEqual([]);
  });

  it("an error or a slow answer records none, reported by reason — and a late failure surfaces nowhere", async () => {
    const r = recorder();
    expect(
      await askPublished(
        async () => {
          throw new Error("catalog down");
        },
        4200,
        r,
      ),
    ).toBeNull();
    const slow = () =>
      new Promise<FarePrices>((_, reject) => setTimeout(() => reject(new Error("late")), 30)) as Promise<FarePrices>;
    expect(await askPublished(slow, 4200, { ...r, timeoutMs: 5 })).toBeNull();
    expect(r.reasons).toEqual(["error", "timeout"]);
    await Bun.sleep(40); // the late rejection is handled: no unhandled rejection fails this test
  });
});
