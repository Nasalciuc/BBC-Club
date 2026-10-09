/** Query count budgets measured on the test fixture, then enforced. Failures list every query. */
import { describe, expect, it } from "bun:test";
import { testApp } from "./helpers/test-app";
import { storedPricingRules } from "../../../packages/modules/domain/catalog/src/pricing/rules";
import { FIXTURE_RULES } from "../../../packages/modules/domain/catalog/tests/unit/pricing-rules.fixture";

/** Measured 28 Sep on the isolated fixture (not production). A new query in a loop must fail this. */
const BUDGET: Record<string, number> = {
  "GET /v1/home": 40,
  "GET /v1/search": 25,
  "GET /v1/fares/:id": 20,
  "GET /v1/requests": 25,
  "GET /v1/requests/:id": 20,
  "GET /v1/profile": 25,
  "POST /v1/requests": 40,
  "GET /v1/airports/popular": 10,
  "GET /v1/airports/home-suggestion": 10,
};

describe("query budget per route", () => {
  it("member routes stay at or under the fixture budget", async () => {
    const log: string[] = [];
    const t = await testApp({ suite: "query-budget", queryLog: log });
    await t.seedCatalogBasics();
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(created.status).toBe(201);
    const req = (await created.json()) as { id: string };
    const search = await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", {
      headers: { Cookie: t.memberA.cookie },
    });
    expect(search.status).toBe(200);
    const searchBody = (await search.json()) as { items: { id: string }[] };
    const fareId = searchBody.items[0]?.id;
    expect(fareId).toBeTruthy();

    async function queriesFor(path: string, init?: RequestInit) {
      log.length = 0;
      const res = await t.app.request(path, init);
      expect(res.status, `${path} ${res.status} ${await res.text()}`).toBeLessThan(400);
      return [...log];
    }

    const cookie = { headers: { Cookie: t.memberA.cookie } };
    const home = await queriesFor("/v1/home", cookie);
    const searchQ = await queriesFor("/v1/search?from=JFK&to=LHR&cabin=business", cookie);
    const fareQ = await queriesFor(`/v1/fares/${fareId}`, cookie);
    const listQ = await queriesFor("/v1/requests", cookie);
    const detailQ = await queriesFor(`/v1/requests/${req.id}`, cookie);
    const profileQ = await queriesFor("/v1/profile", cookie);
    const popularQ = await queriesFor("/v1/airports/popular?from=JFK", cookie);
    const homeSuggestionQ = await queriesFor("/v1/airports/home-suggestion?tz=America%2FNew_York", cookie);
    const postLog = await (async () => {
      log.length = 0;
      const res = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: crypto.randomUUID() });
      expect(res.status).toBeLessThan(400);
      return [...log];
    })();

    const cases: [string, string[]][] = [
      ["GET /v1/home", home],
      ["GET /v1/search", searchQ],
      ["GET /v1/fares/:id", fareQ],
      ["GET /v1/requests", listQ],
      ["GET /v1/requests/:id", detailQ],
      ["GET /v1/profile", profileQ],
      ["POST /v1/requests", postLog],
      ["GET /v1/airports/popular", popularQ],
      ["GET /v1/airports/home-suggestion", homeSuggestionQ],
    ];
    for (const [name, qs] of cases) {
      const cap = BUDGET[name]!;
      expect(qs.length, `${name} ran ${qs.length} queries (budget ${cap}):\n${qs.join("\n")}`).toBeLessThanOrEqual(cap);
    }

    // ADR-IMPL-037: a search with no fare and estimates on reads two flag rows (cached) and computes in memory.
    await t.flags.set("catalog.estimates", { enabled: true });
    await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
    const estimateSearch = await queriesFor("/v1/search?from=JFK&to=ZRH&cabin=business", cookie);
    expect(
      estimateSearch.length,
      `no-fare search with estimates ran ${estimateSearch.length} queries (budget ${BUDGET["GET /v1/search"]}):\n${estimateSearch.join("\n")}`,
    ).toBeLessThanOrEqual(BUDGET["GET /v1/search"]!);

    // ADR-IMPL-042: a quote with estimates on asks the catalog once — the cached flags, then airports and fares in one
    // round trip each. Measured against the same POST budget.
    const quoteLog = await (async () => {
      log.length = 0;
      const res = await t.submitRequestAs(
        t.memberB,
        t.sampleRequestBody({
          intent: "quote",
          priceAtRequest: undefined,
          legs: [
            { from: "JFK", to: "ZRH", date: "2027-10-12" },
            { from: "ZRH", to: "JFK", date: "2027-10-19" },
          ],
        }),
        { idempotencyKey: crypto.randomUUID() },
      );
      expect(res.status).toBe(201);
      return [...log];
    })();
    expect(
      quoteLog.length,
      `quote with estimates ran ${quoteLog.length} queries (budget ${BUDGET["POST /v1/requests"]}):\n${quoteLog.join("\n")}`,
    ).toBeLessThanOrEqual(BUDGET["POST /v1/requests"]!);
    expect(quoteLog.length, "the estimate costs at most two reads over a plain request").toBeLessThanOrEqual(
      postLog.length + 2,
    );

    await t.seedMoreJfkLhrFares();
    const largerSearch = await queriesFor("/v1/search?from=JFK&to=LHR&cabin=business", cookie);
    expect(
      largerSearch.length,
      `search grew from ${searchQ.length} to ${largerSearch.length} queries after 12 more fares:\n${largerSearch.join("\n")}`,
    ).toBeLessThanOrEqual(searchQ.length + 2);

    await t.close();
  }, 60_000);
});
