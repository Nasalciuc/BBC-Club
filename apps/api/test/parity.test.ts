/** Fixture parity: the first fixture offer (london) round-trips through ingest → feed → detail
 *  with the exact shape the design system expects. */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";
import { fixture } from "@bbc/shared/fixture";

const london = fixture.offers[0]; // "Your October in London"

describe("fixture parity (london offer)", () => {
  it("ingest → feed → detail round-trip matches fixture shape", async () => {
    const t = await testApp({ suite: "parity" });

    // Seed the london offer targeting member A
    const offerId = await t.seedBroadcastOffer({
      source: "crm_agent",
      targeting: "user",
      targetMemberId: t.memberA.id,
      routeFrom: london.from,
      routeTo: london.to,
      price: String(london.price) + ".00",
      publishedPrice: String(london.published) + ".00",
      title: london.title,
      validUntil: london.validUntil,
      flightFacts: london.facts,
    });

    // Feed
    const feedRes = await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } });
    expect(feedRes.status).toBe(200);
    const feed = (await feedRes.json()) as any;
    const card = feed.items.find((i: any) => i.id === offerId);
    expect(card).toBeTruthy();
    expect(card.title).toBe(london.title);
    expect(card.route).toMatchObject({ from: london.from, to: london.to });
    expect(card.price.offer).toBe(london.price);
    expect(card.price.published).toBe(london.published);
    expect(card.targeting).toBe("personal");
    expect(card.state).toBe("unseen");

    // Detail
    const detailRes = await t.app.request(`/v1/proposals/${offerId}`, { headers: { Cookie: t.memberA.cookie } });
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as any;
    expect(detail.advisorName).toBe(fixture.advisor.name);
    expect(detail.flightFacts).toMatchObject({
      nonstop: london.facts.nonstop,
      durationMinutes: london.facts.durationMinutes,
      product: london.facts.product,
      carrier: london.facts.carrier,
      flightNumber: london.facts.flightNumber,
    });

    // Member B does not see member A's personal offer (IDOR)
    const bFeed = await t.app.request("/v1/proposals", { headers: { Cookie: t.memberB.cookie } });
    const bBody = (await bFeed.json()) as any;
    expect(bBody.items.map((i: any) => i.id)).not.toContain(offerId);

    await t.close();
  });

  it("after responding 'interested' the state in feed updates", async () => {
    const t = await testApp({ suite: "parity-state" });
    const offerId = await t.seedBroadcastOffer({
      routing: "broadcast",
      title: london.title,
      validUntil: london.validUntil,
    });
    await t.respondAs(t.memberA, offerId, "interested");
    await t.drainAll();
    const feedRes = await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } });
    const feed = (await feedRes.json()) as any;
    const card = feed.items.find((i: any) => i.id === offerId);
    expect(card?.state).toBe("interested");
    await t.close();
  });
});
