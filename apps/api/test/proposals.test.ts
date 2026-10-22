/** Proposals feed + detail: IDOR guard, ETag/304, 410 GONE, the rating on the cards. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { HomeVM } from "@bbc/shared/api/v1/fares";
import { FeedVM, ProposalCardVM, ProposalDetailVM } from "@bbc/shared/api/v1/proposals";
import { testApp } from "./helpers/test-app";

describe("GET /v1/proposals", () => {
  it("returns FeedVM with items, summary, and ETag", async () => {
    const t = await testApp({ suite: "proposals-feed" });
    await t.seedBroadcastOffer();
    const r = await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.summary).toMatchObject({ total: expect.any(Number), personal: expect.any(Number) });
    expect(r.headers.get("ETag")).toBeTruthy();
    await t.close();
  });

  it("returns 304 when ETag matches", async () => {
    const t = await testApp({ suite: "proposals-304" });
    await t.seedBroadcastOffer();
    const r1 = await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } });
    const etag = r1.headers.get("ETag")!;
    const r2 = await t.app.request("/v1/proposals", {
      headers: { Cookie: t.memberA.cookie, "If-None-Match": etag },
    });
    expect(r2.status).toBe(304);
    await t.close();
  });

  it("401 without session", async () => {
    const t = await testApp({ suite: "proposals-unauth" });
    const r = await t.app.request("/v1/proposals");
    expect(r.status).toBe(401);
    await t.close();
  });

  it("member A cannot see offers targeted at member B (IDOR)", async () => {
    const t = await testApp({ suite: "proposals-idor" });
    const offerId = await t.seedTargetedOffer(t.memberB.id);
    const r = await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    const ids = body.items.map((i: any) => i.id);
    expect(ids).not.toContain(offerId);
    await t.close();
  });

  it("feed items include state field", async () => {
    const t = await testApp({ suite: "proposals-state" });
    const offerId = await t.seedBroadcastOffer();
    await t.upsertResponse(t.memberA.id, offerId, "interested");
    const r = await t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } });
    const body = (await r.json()) as any;
    const item = body.items.find((i: any) => i.id === offerId);
    expect(item?.state).toBe("interested");
    await t.close();
  });
});

describe("GET /v1/proposals/:id", () => {
  it("returns ProposalDetailVM with advisorName", async () => {
    const t = await testApp({ suite: "proposal-detail" });
    const offerId = await t.seedBroadcastOffer();
    const r = await t.app.request(`/v1/proposals/${offerId}`, { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.id).toBe(offerId);
    expect(body.advisorName).toBe("Julia Reed");
    expect(body.price).toMatchObject({ offer: expect.any(Number), currency: expect.any(String) });
    await t.close();
  });

  it("404 for unknown id", async () => {
    const t = await testApp({ suite: "proposal-404" });
    const r = await t.app.request("/v1/proposals/00000000-0000-4000-8000-000000000000", {
      headers: { Cookie: t.memberA.cookie },
    });
    expect(r.status).toBe(404);
    await t.close();
  });

  it("404 for another member's targeted offer (IDOR)", async () => {
    const t = await testApp({ suite: "proposal-idor-detail" });
    const offerId = await t.seedTargetedOffer(t.memberB.id);
    const r = await t.app.request(`/v1/proposals/${offerId}`, { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(404);
    await t.close();
  });

  it("410 GONE for own expired offer", async () => {
    const t = await testApp({ suite: "proposal-gone" });
    const offerId = await t.seedExpiredOffer();
    const r = await t.app.request(`/v1/proposals/${offerId}`, { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(410);
    await t.close();
  });
});

// An offer sent with a later publishAt is a schedule: until then no member sees it — not in the feed (whose order,
// publish_at newest first, put it at the top), not in Home's carousels, not by its id.
describe("a scheduled offer", () => {
  it("is in no feed, no Home section and answers 404 until its publishAt", async () => {
    const t = await testApp({ suite: "proposal-scheduled" });
    await t.seedCatalogBasics();
    const cookie = { headers: { Cookie: t.memberA.cookie } };
    const live = await t.seedBroadcastOffer({ routeTo: "LHR", title: "London calling" });
    const scheduled = await t.seedBroadcastOffer({
      source: "crm_agent",
      targeting: "user",
      targetMemberId: t.memberA.id,
      routeTo: "CDG",
      title: "Your weekend in Paris",
      publishAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    });

    const feed = FeedVM.parse(await (await t.app.request("/v1/proposals", cookie)).json());
    expect(feed.items.map((i) => i.id)).toEqual([live]);
    const home = HomeVM.parse(await (await t.app.request("/v1/home", cookie)).json());
    expect(home.sections.flatMap((s) => s.items).map((i) => i.id)).not.toContain(scheduled);
    expect(home.destinations.find((d) => d.code === "CDG")?.hasOffer).toBe(false);
    expect((await t.app.request(`/v1/proposals/${scheduled}`, cookie)).status).toBe(404);

    // Its time comes: it is out, first in the feed (the newest published).
    await t.db.execute(sql`UPDATE proposals.offers SET publish_at = now() WHERE id = ${scheduled}`);
    const after = FeedVM.parse(await (await t.app.request("/v1/proposals", cookie)).json());
    expect(after.items.map((i) => i.id)).toEqual([scheduled, live]);
    expect((await t.app.request(`/v1/proposals/${scheduled}`, cookie)).status).toBe(200);
    await t.close();
  }, 60_000);
});

// ADR-IMPL-056: the rating an offer's cards print beside the city (02, 16: `★ 4.8`), as the offer's sender gave it.
describe("an offer's rating", () => {
  it("reaches the feed, the detail and Home's cards; an offer made without one has none", async () => {
    const t = await testApp({ suite: "proposal-rating" });
    await t.seedCatalogBasics();
    const cookie = { headers: { Cookie: t.memberA.cookie } };
    const rated = await t.seedBroadcastOffer({ rating: 4.8 });
    const unrated = await t.seedBroadcastOffer({ routeTo: "LHR", title: "London calling" });

    const feed = FeedVM.parse(await (await t.app.request("/v1/proposals", cookie)).json());
    expect(feed.items.find((i) => i.id === rated)?.rating).toBe(4.8);
    expect(feed.items.find((i) => i.id === unrated)?.rating).toBeNull();
    const detail = ProposalDetailVM.parse(await (await t.app.request(`/v1/proposals/${rated}`, cookie)).json());
    expect(detail.rating).toBe(4.8);
    const home = HomeVM.parse(await (await t.app.request("/v1/home", cookie)).json());
    const cards = home.sections.flatMap((s) => s.items);
    expect(cards.find((c) => c.id === rated)?.rating).toBe(4.8);
    expect(cards.find((c) => c.id === unrated)?.rating).toBeNull();

    // The ingest refuses a rating outside one to five, or past one decimal place: nothing is stored.
    for (const rating of [5.5, 0.5, 4.85, "4.8"]) {
      const r = await t.app.request("/v1/internal/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": t.internalSecret,
          "Idempotency-Key": `test:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          source: "marketing_campaign",
          targeting: "broadcast",
          routeFrom: "JFK",
          routeTo: "CDG",
          cabin: "business",
          price: "3850.00",
          title: "Autumn in Paris",
          validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          rating,
        }),
      });
      expect({ rating, status: r.status }).toEqual({ rating, status: 400 });
    }
    await t.close();
  }, 60_000);

  it("both upgrade orders: an older app drops it, a newer one reads an older server's card, an odd one is none", () => {
    const card = {
      id: "44444444-4444-4444-8444-444444444444",
      title: "Autumn in Paris",
      route: { from: "JFK", to: "CDG" },
      cabin: "business",
      price: { offer: 3850, published: 6900, currency: "USD" },
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      state: "unseen",
      targeting: "broadcast",
    };
    expect(ProposalCardVM.omit({ rating: true }).parse({ ...card, rating: 4.8 })).not.toHaveProperty("rating");
    expect(ProposalCardVM.parse(card).rating).toBeUndefined();
    expect(ProposalCardVM.parse({ ...card, rating: 4.8 }).rating).toBe(4.8);
    expect(ProposalCardVM.parse({ ...card, rating: null }).rating).toBeNull();
    for (const odd of [0, 5.5, "4.8", { stars: 4.8 }]) {
      const parsed = ProposalCardVM.parse({ ...card, rating: odd });
      expect(parsed.rating).toBeNull();
      expect(parsed.title).toBe("Autumn in Paris");
    }
  });
});
