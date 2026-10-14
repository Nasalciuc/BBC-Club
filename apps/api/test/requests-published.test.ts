/** ADR-IMPL-046: a request made from a fare keeps the fare's published price and its source as they stood when the
 *  member asked — read by the server from the fare, never taken from the app — and the member's answers carry it (the
 *  detail strikes it beside a ready quote's fare, Figma 233:4204). A fare re-priced since the app showed it keeps none,
 *  as does a quote. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { RequestVM } from "@bbc/shared/api/v1/requests";
import { testApp } from "./helpers/test-app";

describe("a fare request keeps its fare's published price", () => {
  it("records the fare's published price and its source for the price the app sent, and keeps them", async () => {
    const t = await testApp({ suite: "requests-published" });
    await t.seedCatalogBasics();
    const [ba] = (await t.db.execute(
      sql`SELECT id FROM catalog.fares WHERE route_from = 'JFK' AND route_to = 'LHR' AND carrier = 'BA'`,
    )) as unknown as { id: string }[];
    if (!ba) throw new Error("the BA fare was not seeded");
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

    // From the fare, at its price: the published price and its source, on the answer, the detail and the list.
    const fare = await post({ fareId: ba.id, priceAtRequest: 4200 });
    expect(fare.vm.publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    expect((await detail(fare)).publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    const list = (await (await t.app.request("/v1/requests", { headers: { Cookie: fare.member.cookie } })).json()) as {
      items: unknown[];
    };
    const listed = list.items.map((i) => RequestVM.parse(i)).find((i) => i.id === fare.vm.id);
    expect(listed?.publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });

    // A published price in the body is not RequestBody's: the parse drops it, and the server's own stands.
    const sent = await post({
      fareId: ba.id,
      priceAtRequest: 4200,
      publishedAtRequest: { amount: 99_999, source: "made up" },
    });
    expect(sent.vm.publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });

    // Re-priced since the app showed it: none — never one price beside another's reference.
    expect((await post({ fareId: ba.id, priceAtRequest: 3999 })).vm.publishedAtRequest).toBeNull();
    // A fare request without a price, and a quote, keep none.
    expect((await post({ fareId: ba.id, priceAtRequest: undefined })).vm.publishedAtRequest).toBeNull();
    expect((await post({ intent: "quote" })).vm.publishedAtRequest).toBeNull();

    // The night's import changes the fare afterwards: the request keeps what the member saw.
    await t.db.execute(
      sql`UPDATE catalog.fares SET published_price = '9000.00', published_source = 'Sabre · 1 Oct' WHERE id = ${ba.id}`,
    );
    expect((await detail(fare)).publishedAtRequest).toEqual({ amount: 7850, source: "Sabre · test" });
    await t.close();
  }, 60_000);
});
