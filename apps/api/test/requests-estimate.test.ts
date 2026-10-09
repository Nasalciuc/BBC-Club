/** ADR-IMPL-042: a quote request whose app showed the indicative price carries it — recomputed by the server, stored
 *  on the row, published with request.submitted (with the rules' fingerprint) and written into the specialist's
 *  e-mail. A quote whose app showed none carries none. And the member's note reaches the specialist at last. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { storedPricingRules } from "../../../packages/modules/domain/catalog/src/pricing/rules";
import { FIXTURE_RULES } from "../../../packages/modules/domain/catalog/tests/unit/pricing-rules.fixture";
import { testApp } from "./helpers/test-app";

const FARE = "11111111-1111-4111-8111-111111111111";

const round = (from: string, to: string, over: Record<string, unknown> = {}) => ({
  legs: [
    { from, to, date: "2027-10-12" },
    { from: to, to: from, date: "2027-10-19" },
  ],
  priceAtRequest: undefined,
  // The app showed the indicative fare before the member asked (the frontend's estimate row).
  estimateShown: true,
  ...over,
});

type Shown = { amount: number | null; currency: string | null };

async function shown(t: Awaited<ReturnType<typeof testApp>>, id: string): Promise<Shown> {
  const [row] = (await t.db.execute(
    sql`SELECT shown_estimate_amount AS amount, shown_estimate_currency AS currency FROM requests.requests
        WHERE id = ${id}`,
  )) as unknown as Shown[];
  if (!row) throw new Error(`request ${id} not found`);
  return row;
}

describe("a quote request carries the estimate its search showed", () => {
  it("stores, publishes and sends the server's estimate — and nothing the app sent", async () => {
    const t = await testApp({ suite: "requests-estimate" });
    await t.seedCatalogBasics();
    // Nine requests: alternate the two members, so neither meets the request rate limit (burst 5).
    let n = 0;
    const post = async (body: Record<string, unknown>) => {
      const member = n++ % 2 === 0 ? t.memberA : t.memberB;
      const res = await t.submitRequestAs(member, t.sampleRequestBody(body), { idempotencyKey: crypto.randomUUID() });
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };

    // Estimates off (production today): nothing is stored, and the question costs nothing.
    const off = await post({ intent: "quote", ...round("JFK", "ZRH") });
    expect(await shown(t, off)).toEqual({ amount: null, currency: null });

    await t.flags.set("catalog.estimates", { enabled: true });
    await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));

    // The search's own number for JFK–ZRH business (catalog.test.ts), whatever the app put in the body.
    const zurich = await post({
      intent: "quote",
      ...round("JFK", "ZRH"),
      estimate: { amount: 1, currency: "USD" },
      shownEstimateAmount: 1,
      price: 1,
      note: "Two children, 7 and 10. Mornings are best.",
    });
    expect(await shown(t, zurich)).toEqual({ amount: 1633, currency: "USD" });
    const journal = await t.journal.byType("request.submitted");
    const published = journal.find((e) => e.payload.requestId === zurich);
    // The fingerprint names the rules that computed the number (it identifies them, never reveals them).
    expect(published?.payload.shownEstimate).toEqual({
      amount: 1633,
      currency: "USD",
      rules: storedPricingRules(FIXTURE_RULES).fingerprint,
    });

    // An app that did not show an estimate — an older app, a dated search, an offer card — gets none.
    expect(
      await shown(t, await post({ intent: "quote", ...round("JFK", "ZRH", { estimateShown: undefined }) })),
    ).toEqual({ amount: null, currency: null });

    // A request without an intent, a fare or an offer is a quote too (effectiveIntent).
    expect(await shown(t, await post(round("JFK", "ZRH")))).toEqual({ amount: 1633, currency: "USD" });
    // First follows the request's cabin.
    expect(await shown(t, await post({ intent: "quote", cabin: "first", ...round("JFK", "ZRH") }))).toEqual({
      amount: 1776,
      currency: "USD",
    });
    // Published fares on the route: the search showed them, not an estimate.
    expect(await shown(t, await post({ intent: "quote", ...round("JFK", "LHR") }))).toEqual({
      amount: null,
      currency: null,
    });
    // Outside North America the formula has no price: on request, never invented.
    expect(await shown(t, await post({ intent: "quote", ...round("RMO", "LHR") }))).toEqual({
      amount: null,
      currency: null,
    });
    // A fare request and an alternative never carry one.
    expect(await shown(t, await post({ fareId: FARE, ...round("JFK", "ZRH") }))).toEqual({
      amount: null,
      currency: null,
    });
    expect(await shown(t, await post({ intent: "alternative", replacesFareId: FARE, ...round("JFK", "ZRH") }))).toEqual(
      { amount: null, currency: null },
    );

    // The specialist's payload: the estimate with its cabin, and the member's note.
    await t.platform.jobs.run("send-requests");
    const sent = t.crm.submitted as { _request_id: string; shown_estimate: unknown; note: unknown }[];
    const forZurich = sent.find((p) => p._request_id === zurich);
    expect(forZurich?.shown_estimate).toEqual({ amount: 1633, currency: "USD", cabin: "business" });
    expect(forZurich?.note).toBe("Two children, 7 and 10. Mornings are best.");
    expect(sent.find((p) => p._request_id === off)?.shown_estimate).toBeNull();

    const metrics = await (await t.app.request("/metrics")).text();
    // Counted once stored: two business quotes and one first carry an estimate.
    expect(metrics).toContain('bbc_request_estimates_stored{cabin="business"} 2');
    expect(metrics).toContain('bbc_request_estimates_stored{cabin="first"} 1');
    await t.close();
  }, 60_000);

  it("rules missing: the request goes through without an estimate, and the gap is counted", async () => {
    const t = await testApp({ suite: "requests-estimate-norules" });
    await t.seedCatalogBasics();
    await t.flags.set("catalog.estimates", { enabled: true });
    const res = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ intent: "quote", ...round("JFK", "ZRH") }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await shown(t, id)).toEqual({ amount: null, currency: null });
    const metrics = await (await t.app.request("/metrics")).text();
    expect(metrics).toContain('bbc_request_estimates_unavailable{reason="missing"} 1');
    await t.close();
  });

  it("a catalog that fails gives no estimate: the request still goes through, and the failure is counted", async () => {
    const t = await testApp({ suite: "requests-estimate-broken" });
    await t.seedCatalogBasics();
    await t.flags.set("catalog.estimates", { enabled: true });
    await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
    // The fare read fails in this isolated database: an error from the catalog, never a refused request.
    await t.db.execute(sql`ALTER TABLE catalog.fares RENAME TO fares_unreachable`);
    const res = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ intent: "quote", ...round("JFK", "ZRH") }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await shown(t, id)).toEqual({ amount: null, currency: null });
    const metrics = await (await t.app.request("/metrics")).text();
    expect(metrics).toContain('bbc_request_estimates_unavailable{reason="error"} 1');
    await t.close();
  });
});
