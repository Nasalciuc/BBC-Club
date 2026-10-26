/** ADR-IMPL-063: the company's site as the club's indicative price source behind the catalog — the search, a quote
 *  request, Home's site pins — with `catalog.site_prices` off (exactly as before) and on. The site is a fake `fetch`
 *  injected into the catalog (testApp's `catalog` seam): no test reaches the network. Every price is made up. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { HomeVM, SearchResultVM } from "@bbc/shared/api/v1/fares";
import { storedPricingRules } from "../../../packages/modules/domain/catalog/src/pricing/rules";
import { FIXTURE_RULES } from "../../../packages/modules/domain/catalog/tests/unit/pricing-rules.fixture";
import { fakePriceSite } from "../../../packages/modules/domain/catalog/tests/unit/site-prices.fixture";
import { testApp } from "./helpers/test-app";
import { DEPART, RETURN } from "./helpers/days";

const RT = "round_trip";
const FINGERPRINT = storedPricingRules(FIXTURE_RULES).fingerprint;
// Made-up figures: never the formula's (FIXTURE_RULES gives 1633 / 1776 for JFK–ZRH), never a company price.
const ZURICH = { business: 2222, first: 3333, premium_economy: 1111 };

async function setup(suite: string) {
  const site = fakePriceSite({
    [`JFK-ZRH ${RT}`]: ZURICH,
    [`JFK-NBO ${RT}`]: "unknown_airport",
    [`JFK-MAD ${RT}`]: { status: 503 },
    [`JFK-FCO ${RT}`]: "hang",
    [`JFK-ATH ${RT}`]: { business: 2444, first: 3555, premium_economy: 1222 },
  });
  const t = await testApp({ suite, catalog: { fetch: site.fetch } });
  await t.seedCatalogBasics();
  await t.flags.set("catalog.estimates", { enabled: true });
  await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
  let n = 0;
  const search = async (to: string, opts: { cabin?: "business" | "first"; when?: string; from?: string } = {}) => {
    // Alternate the two members: the search's burst is per member.
    const member = n++ % 2 === 0 ? t.memberA : t.memberB;
    const query = new URLSearchParams({
      from: opts.from ?? "JFK",
      to,
      cabin: opts.cabin ?? "business",
      ...(opts.when ? { when: opts.when } : {}),
    });
    const r = await t.app.request(`/v1/search?${query}`, { headers: { Cookie: member.cookie } });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(() => SearchResultVM.parse(body)).not.toThrow();
    return body as { items: unknown[]; estimate: Record<string, unknown> | null };
  };
  const stored = async () =>
    (
      (await t.db.execute(sql`
        SELECT route_from, route_to, status, business FROM catalog.site_prices ORDER BY route_to`)) as unknown as {
        route_from: string;
        route_to: string;
        status: string;
        business: number | null;
      }[]
    ).map((r) => `${r.route_from.trim()}-${r.route_to.trim()} ${r.status}${r.business ? ` ${r.business}` : ""}`);
  return { t, site, search, stored };
}

describe("GET /v1/search — the site's price (ADR-IMPL-063)", () => {
  it("with catalog.site_prices off, exactly as before: the formula, no source, no question to the site", async () => {
    const { t, site, search, stored } = await setup("site-prices-search-off");
    expect((await search("ZRH")).estimate).toEqual({
      amount: 1633,
      currency: "USD",
      trip: RT,
      cabin: "business",
      basis: "formula",
    });
    expect((await search("NBO")).estimate).not.toBeNull(); // the formula prices a route the company does not
    // The site's flag on, estimates off: the master switch wins — nothing shown, nothing asked.
    await t.flags.set("catalog.site_prices", { enabled: true });
    await t.flags.set("catalog.estimates", { enabled: false });
    expect((await search("ZRH")).estimate).toBeNull();
    expect(site.calls).toEqual([]);
    expect(await stored()).toEqual([]);
    await t.close();
  }, 60_000);

  it("on: the site's price, asked once and stored; the company's none is no number; the formula only when the site cannot be asked", async () => {
    const { t, site, search, stored } = await setup("site-prices-search-on");
    const formula = {
      MAD: (await search("MAD")).estimate?.amount,
      FCO: (await search("FCO")).estimate?.amount,
      ATH: (await search("ATH")).estimate?.amount,
    };
    expect(Object.values(formula).every((a) => typeof a === "number")).toBe(true);
    await t.flags.set("catalog.site_prices", { enabled: true });

    // Nothing stored: one live question, its answer shown with its source and when it was read, and stored.
    const zurich = (await search("ZRH")).estimate;
    expect(zurich).toMatchObject({ amount: 2222, currency: "USD", trip: RT, cabin: "business", basis: "formula" });
    expect(zurich).toMatchObject({ source: "site" });
    expect(Date.now() - Date.parse(String(zurich?.asOf))).toBeLessThan(60_000);
    expect(site.calls).toEqual([`JFK-ZRH ${RT}`]);
    // Asked again, or in first: the stored answer — no second question. First is above business: it shows.
    expect((await search("ZRH")).estimate).toMatchObject({ amount: 2222, source: "site" });
    expect((await search("ZRH", { cabin: "first" })).estimate).toMatchObject({ amount: 3333, source: "site" });
    expect(site.calls).toHaveLength(1);

    // The company has no price (an airport its site does not know): no number — not the formula — and it is stored.
    expect((await search("NBO")).estimate).toBeNull();
    expect((await search("NBO")).estimate).toBeNull();
    expect(site.calls.filter((c) => c.startsWith("JFK-NBO"))).toHaveLength(1);

    // The site cannot be asked — a 5xx, or no answer within a second: the formula, said to be the club's; nothing
    // stored, so the next search asks again.
    expect((await search("MAD")).estimate).toEqual({
      amount: formula.MAD,
      currency: "USD",
      trip: RT,
      cabin: "business",
      basis: "formula",
      source: "club",
    });
    const started = Date.now();
    expect((await search("FCO")).estimate).toMatchObject({ amount: formula.FCO, source: "club" });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(await stored()).toEqual(["JFK-NBO none", "JFK-ZRH priced 2222"]);

    // Never asked: published fares win; a dated search; no end in North America; one metro.
    const before = site.calls.length;
    expect((await search("LHR")).items.length).toBeGreaterThan(0);
    const inAMonth = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect((await search("ATH", { when: inAMonth })).estimate).toBeNull();
    expect((await search("LHR", { from: "RMO" })).estimate).toBeNull();
    expect((await search("EWR")).estimate).toBeNull();
    expect(site.calls).toHaveLength(before);

    // An outage: three more 5xx open the breaker (five failures in a row), and the search stops asking — Athens, which
    // the site would price, shows the formula without a question.
    for (let i = 0; i < 3; i++) await search("MAD");
    const open = site.calls.length;
    expect((await search("ATH")).estimate).toMatchObject({ amount: formula.ATH, source: "club" });
    expect(site.calls).toHaveLength(open);

    const metrics = await (await t.app.request("/metrics")).text();
    expect(metrics).toContain('bbc_site_prices_answered{status="priced"} 1');
    expect(metrics).toContain('bbc_site_prices_answered{status="none"} 1');
    expect(metrics).toContain('bbc_site_prices_unavailable{reason="timeout"} 1');
    expect(metrics).toContain('bbc_site_prices_unavailable{reason="breaker"} 1');
    expect(metrics).toContain('bbc_search_site_prices{how="stored",source="site"} 2');
    expect(metrics).toContain('bbc_search_site_prices{how="fallback",source="club"} 6');
    await t.close();
  }, 60_000);
});

describe("a quote request and Home's pins read what the search stored — never the site", () => {
  it("the quote records the number its search showed and who priced it; the specialist's payload says so", async () => {
    const { t, site, search } = await setup("site-prices-request");
    await t.flags.set("catalog.site_prices", { enabled: true });
    await search("ZRH"); // stores the site's answer
    await search("MAD"); // a 5xx: the formula, nothing stored
    const asked = site.calls.length;

    const quote = async (member: typeof t.memberA, to: string) => {
      const res = await t.submitRequestAs(
        member,
        t.sampleRequestBody({
          intent: "quote",
          estimateShown: true,
          priceAtRequest: undefined,
          legs: [
            { from: "JFK", to, date: DEPART },
            { from: to, to: "JFK", date: RETURN },
          ],
        }),
        { idempotencyKey: crypto.randomUUID() },
      );
      expect(res.status).toBe(201);
      const id = ((await res.json()) as { id: string }).id;
      const [row] = (await t.db.execute(sql`
        SELECT shown_estimate_amount AS amount, shown_estimate_source AS source FROM requests.requests
        WHERE id = ${id}`)) as unknown as { amount: number | null; source: string | null }[];
      if (!row) throw new Error(`request ${id} not found`);
      return { id, row };
    };
    const zurich = await quote(t.memberA, "ZRH");
    expect(zurich.row).toEqual({ amount: 2222, source: "site" });
    const madrid = await quote(t.memberB, "MAD");
    expect(madrid.row.source).toBe("club");
    // Inside the submit's transaction: no question to the site.
    expect(site.calls).toHaveLength(asked);

    const journal = await t.journal.byType("request.submitted");
    const event = (id: string) => journal.find((e) => e.payload.requestId === id)?.payload.shownEstimate;
    // The site's number has no rules behind it; the formula's keeps its rules' fingerprint.
    expect(event(zurich.id)).toEqual({ amount: 2222, currency: "USD", source: "site" });
    expect(event(madrid.id)).toEqual({
      amount: madrid.row.amount,
      currency: "USD",
      rules: FINGERPRINT,
      source: "club",
    });

    await t.platform.jobs.run("send-requests");
    const sent = t.crm.submitted as { _request_id: string; shown_estimate: unknown }[];
    expect(sent.find((p) => p._request_id === zurich.id)?.shown_estimate).toEqual({
      amount: 2222,
      currency: "USD",
      cabin: "business",
      source: "site",
    });
    expect(sent.find((p) => p._request_id === madrid.id)?.shown_estimate).toMatchObject({ source: "club" });
    await t.close();
  }, 60_000);

  it("Home's site pins: the stored answer with its source, else the formula; the company's none is no pin", async () => {
    const { t, site, search } = await setup("site-prices-home");
    // The site's cities listed from JFK (made-up deals); no fare to any of them.
    await t.db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted) VALUES
        (1201, 'Zurich', 'Switzerland', 'Europe', 'ZRH', ARRAY['ZRH'], true),
        (1202, 'Nairobi', 'Kenya', 'Africa', 'NBO', ARRAY['NBO'], false),
        (1203, 'Athens', 'Greece', 'Europe', 'ATH', ARRAY['ATH'], false)`);
    await t.db.execute(sql`
      INSERT INTO catalog.site_routes (route_from, cms_id, deal, price) VALUES
        ('JFK', 1201, 1, 1000), ('JFK', 1202, 2, 1000), ('JFK', 1203, 3, 1000)`);
    await t.flags.set("catalog.site_pins", { enabled: true });
    const pins = async () => {
      const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } });
      expect(r.status).toBe(200);
      return HomeVM.parse(await r.json()).destinations;
    };
    // Off: the formula's pins, as before, with no source.
    const off = await pins();
    expect(off.filter((p) => ["ZRH", "NBO", "ATH"].includes(p.code))).toHaveLength(3);
    for (const p of off) expect(p).not.toHaveProperty("priceSource");

    await t.flags.set("catalog.site_prices", { enabled: true });
    await search("ZRH");
    await search("NBO");
    const asked = site.calls.length;
    const on = await pins(); // the site's prices on: the pins' own cache key, so no minute to wait

    expect(on.find((p) => p.code === "ZRH")).toMatchObject({ fromPrice: 2222, priceSource: "site" });
    expect(on.find((p) => p.code === "NBO")).toBeUndefined();
    expect(on.find((p) => p.code === "ATH")).toMatchObject({ priceSource: "club" });
    expect(site.calls).toHaveLength(asked);
    await t.close();
  }, 60_000);
});
