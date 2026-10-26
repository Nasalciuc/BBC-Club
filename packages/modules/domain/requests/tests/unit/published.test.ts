import { describe, expect, it } from "bun:test";
import { RequestVM } from "@bbc/shared/api/v1/requests";
import type { AskFailure } from "../../src/application/ask-within";
import { askFare, carrierAtRequest, publishedAtRequest, type CatalogFare } from "../../src/application/published";

const fare: CatalogFare = {
  routeFrom: "JFK",
  routeTo: "LHR",
  cabin: "business",
  price: "4200.00",
  publishedPrice: "7850.00",
  publishedSource: "BA published · 16 Sep",
  currency: "USD",
  carrier: "BA",
  carrierName: "British Airways",
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

describe("carrierAtRequest — the airline a fare request was made for (ADR-IMPL-056)", () => {
  it("the fare's airline as its page named it: the name, with the code", () => {
    expect(carrierAtRequest(fare)).toEqual({ code: "BA", name: "British Airways" });
    expect(carrierAtRequest({ carrier: "u2", carrierName: " easyJet " })).toEqual({ code: "U2", name: "easyJet" });
  });

  it("a fare named without a code keeps its name; a code without a name is the name its page showed", () => {
    expect(carrierAtRequest({ carrier: null, carrierName: "British Airways" })).toEqual({
      code: null,
      name: "British Airways",
    });
    expect(carrierAtRequest({ carrier: "VS", carrierName: null })).toEqual({ code: "VS", name: "VS" });
    expect(carrierAtRequest({ carrier: "VS", carrierName: "  " })).toEqual({ code: "VS", name: "VS" });
  });

  it("a code that is not two letters or digits is no code — and never a name on its own", () => {
    expect(carrierAtRequest({ carrier: "B ", carrierName: "British Airways" })).toEqual({
      code: null,
      name: "British Airways",
    });
    expect(carrierAtRequest({ carrier: "B-", carrierName: null })).toBeNull();
  });

  it("nothing for a fare that is gone or names no airline — never `Unknown`", () => {
    expect(carrierAtRequest(null)).toBeNull();
    expect(carrierAtRequest({ carrier: null, carrierName: null })).toBeNull();
    expect(carrierAtRequest({ carrier: "", carrierName: "" })).toBeNull();
  });

  it("kept whatever the fare costs now: a re-priced fare is the same flight on the same airline", async () => {
    const r = recorder();
    expect(await askFare(async () => fare, 4100, r)).toEqual({
      published: null,
      carrier: { code: "BA", name: "British Airways" },
      trip: { from: "JFK", to: "LHR", cabin: "business" },
    });
    // A fare request without a price keeps its airline too.
    expect((await askFare(async () => fare, undefined, r)).carrier).toEqual({ code: "BA", name: "British Airways" });
  });
});

describe("askFare — what a fare request records never decides whether it is accepted", () => {
  it("one read gives the published price and the airline, and its absence neither", async () => {
    const r = recorder();
    let reads = 0;
    expect(
      await askFare(
        async () => {
          reads++;
          return fare;
        },
        4200,
        r,
      ),
    ).toEqual({
      published: { amount: 7850, source: "BA published · 16 Sep" },
      carrier: { code: "BA", name: "British Airways" },
      trip: { from: "JFK", to: "LHR", cabin: "business" },
    });
    expect(reads).toBe(1);
    // No such fare: nothing to record, and the request is refused for it (submit).
    expect(await askFare(async () => null, 4200, r)).toEqual({ published: null, carrier: null, trip: "missing" });
    expect(r.reasons).toEqual([]);
  });

  it("an error or a slow answer records neither, reported by reason — and a late failure surfaces nowhere", async () => {
    const r = recorder();
    expect(
      await askFare(
        async () => {
          throw new Error("catalog down");
        },
        4200,
        r,
      ),
    ).toEqual({ published: null, carrier: null, trip: null });
    const slow = () =>
      new Promise<CatalogFare>((_, reject) => setTimeout(() => reject(new Error("late")), 30)) as Promise<CatalogFare>;
    // A read that failed checks nothing: the request goes on.
    expect(await askFare(slow, 4200, { ...r, timeoutMs: 5 })).toEqual({ published: null, carrier: null, trip: null });
    expect(r.reasons).toEqual(["error", "timeout"]);
    await Bun.sleep(40); // the late rejection is handled: no unhandled rejection fails this test
  });
});

describe("RequestVM.carrier — both upgrade orders (ADR-IMPL-056)", () => {
  const answer = {
    id: "33333333-3333-4333-8333-333333333333",
    reference: "",
    route: "JFK → LHR",
    dates: "Oct 12–19, 2026",
    cabin: "business",
    passengers: { adult: 1, child: 0, infant: 0 },
    priceAtRequest: 4200,
    status: "received",
    createdAt: new Date().toISOString(),
    timeline: [],
  };

  it("an app built before the airline parses an answer that has it, and drops it", () => {
    const older = RequestVM.omit({ carrier: true });
    const parsed = older.parse({ ...answer, carrier: { code: "BA", name: "British Airways" } });
    expect(parsed).not.toHaveProperty("carrier");
  });

  it("an app built with it reads an older server's answer: no airline", () => {
    expect(RequestVM.parse(answer).carrier).toBeUndefined();
  });

  it("reads the airline, with or without its code; a value it cannot read is none, and the request still lists", () => {
    expect(RequestVM.parse({ ...answer, carrier: { code: "BA", name: "British Airways" } }).carrier).toEqual({
      code: "BA",
      name: "British Airways",
    });
    expect(RequestVM.parse({ ...answer, carrier: { code: null, name: "British Airways" } }).carrier).toEqual({
      code: null,
      name: "British Airways",
    });
    expect(RequestVM.parse({ ...answer, carrier: null }).carrier).toBeNull();
    for (const odd of [{ code: "BAW", name: "British Airways" }, { code: "BA", name: " " }, { code: "BA" }, "BA", 7]) {
      const parsed = RequestVM.parse({ ...answer, carrier: odd });
      expect(parsed.carrier).toBeNull();
      expect(parsed.route).toBe("JFK → LHR");
    }
  });
});
