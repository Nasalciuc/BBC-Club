/** ADR-IMPL-046: a request made from a fare keeps the fare's published price and its source as they stood when the
 *  member asked — read by the server from the fare, never taken from the app — and the member's answers carry it (the
 *  detail strikes it beside a ready quote's fare, Figma 233:4204). A fare re-priced since the app showed it keeps none,
 *  as does a quote. ADR-IMPL-056: the same read keeps the fare's airline, which the request received and its detail name
 *  (images 08, 11) — for a re-priced fare too; never for a quote. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { RequestVM } from "@bbc/shared/api/v1/requests";
import { testApp } from "./helpers/test-app";

describe("a fare request keeps its fare's published price and its airline", () => {
  it("records the fare's published price and its source for the price the app sent, its airline, and keeps them", async () => {
    const t = await testApp({ suite: "requests-published" });
    await t.seedCatalogBasics();
    const [ba] = (await t.db.execute(
      sql`SELECT id FROM catalog.fares WHERE route_from = 'JFK' AND route_to = 'LHR' AND carrier = 'BA'`,
    )) as unknown as { id: string }[];
    if (!ba) throw new Error("the BA fare was not seeded");
    const britishAirways = { code: "BA", name: "British Airways" };
    // Five requests: alternate the two members, so neither meets the request rate limit (burst 5).
    let n = 0;
    const post = async (body: Record<string, unknown>) => {
      const member = n++ % 2 === 0 ? t.memberA : t.memberB;
      const res = await t.submitRequestAs(member, t.sampleRequestBody(body), { idempotencyKey: crypto.randomUUID() });
      expect(res.status).toBe(201);
      return { member, vm: RequestVM.parse(await res.json()) };
    };
    const detail = async (r: Awaited<ReturnType<typeof post>>) =>
      RequestVM.parse(
        await (await t.app.request(`/v1/requests/${r.vm.id}`, { headers: { Cookie: r.member.cookie } })).json(),
      );

    // From the fare, at its price: the published price and its source, and the airline, on the answer, the detail and
    // the list.
    const fare = await post({ fareId: ba.id, priceAtRequest: 4200 });
    expect(fare.vm.publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    expect(fare.vm.carrier).toEqual(britishAirways);
    expect((await detail(fare)).publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    expect((await detail(fare)).carrier).toEqual(britishAirways);
    const list = (await (await t.app.request("/v1/requests", { headers: { Cookie: fare.member.cookie } })).json()) as {
      items: unknown[];
    };
    const listed = list.items.map((i) => RequestVM.parse(i)).find((i) => i.id === fare.vm.id);
    expect(listed?.publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    expect(listed?.carrier).toEqual(britishAirways);

    // A published price or an airline in the body is not RequestBody's: the parse drops them, and the server's own
    // stand.
    const sent = await post({
      fareId: ba.id,
      priceAtRequest: 4200,
      publishedAtRequest: { amount: 99_999, source: "made up" },
      carrier: { code: "ZZ", name: "Made Up Air" },
    });
    expect(sent.vm.publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    expect(sent.vm.carrier).toEqual(britishAirways);

    // Re-priced since the app showed it: no published price — never one price beside another's reference — and the
    // same airline: the same flight.
    const repriced = await post({ fareId: ba.id, priceAtRequest: 3999 });
    expect(repriced.vm.publishedAtRequest).toBeNull();
    expect(repriced.vm.carrier).toEqual(britishAirways);
    // A fare request without a price keeps no published price, its airline still; a quote keeps neither.
    const unpriced = await post({ fareId: ba.id, priceAtRequest: undefined });
    expect([unpriced.vm.publishedAtRequest, unpriced.vm.carrier]).toEqual([null, britishAirways]);
    const quote = await post({ intent: "quote", carrier: { code: "BA", name: "British Airways" } });
    expect([quote.vm.publishedAtRequest, quote.vm.carrier]).toEqual([null, null]);

    // The night's import changes the fare afterwards: the request keeps what the member saw.
    await t.db.execute(
      sql`UPDATE catalog.fares SET published_price = '9000.00', published_source = 'Sabre · 1 Oct',
            carrier_name = 'BA Euroflyer' WHERE id = ${ba.id}`,
    );
    expect((await detail(fare)).publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    expect((await detail(fare)).carrier).toEqual(britishAirways);
    const [stored] = (await t.db.execute(
      sql`SELECT carrier_at_request AS code, carrier_name_at_request AS name FROM requests.requests
          WHERE id = ${fare.vm.id}`,
    )) as unknown as { code: string; name: string }[];
    expect(stored).toEqual(britishAirways);
    await t.close();
  }, 60_000);
});
