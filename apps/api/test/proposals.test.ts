/** Proposals feed + detail: IDOR guard, ETag/304, 410 GONE. */
import { describe, it, expect } from "bun:test";
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
    await t.respondAs(t.memberA, offerId, "interested");
    await t.drainAll();
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
    // Ingest rejects validUntil < publish_at (CHECK offers_valid_after_publish). Seed active, then expire.
    const offerId = await t.seedBroadcastOffer();
    await t.db.execute(
      (await import("drizzle-orm")).sql`UPDATE proposals.offers SET status = 'expired' WHERE id = ${offerId}`,
    );
    const r = await t.app.request(`/v1/proposals/${offerId}`, { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(410);
    await t.close();
  });
});
