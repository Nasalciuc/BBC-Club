/** ADR-IMPL-075: Home's and the feed's fast 304 — the phone's copy of the body the same versions gave is answered before
 *  any of the body's reads; a write to a table the body reads moves its generation and the body is computed again. */
import { describe, expect, it } from "bun:test";
import { testApp } from "./helpers/test-app";

const bodyReads = (log: string[]) => log.filter((q) => /"proposals"\."offers"|"catalog"\./.test(q));

describe("versioned revalidation", () => {
  it("Home: a 304 reads the member's home and nothing of the body; a new offer is a 200 with a new tag", async () => {
    const log: string[] = [];
    const t = await testApp({ suite: "home-revalidation", queryLog: log });
    await t.seedCatalogBasics();
    const get = async (etag?: string) => {
      log.length = 0;
      const res = await t.app.request("/v1/home", {
        headers: { Cookie: t.memberA.cookie, ...(etag ? { "If-None-Match": etag } : {}) },
      });
      return { res, reads: bodyReads(log) };
    };

    const first = await get();
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get("Content-Type")).toBe("application/json");
    const etag = first.res.headers.get("ETag")!;
    expect(first.reads.length).toBeGreaterThan(0);

    const again = await get(etag);
    expect(again.res.status).toBe(304);
    expect(again.res.headers.get("ETag")).toBe(etag);
    expect(again.reads, again.reads.join("\n")).toEqual([]);

    // Another phone's copy (or none): the body is computed, and the same tag comes back.
    const other = await get('"0000000000000000"');
    expect(other.res.status).toBe(200);
    expect(other.res.headers.get("ETag")).toBe(etag);

    await t.seedBroadcastOffer({ title: "A new offer" });
    t.platform.reference.generations.invalidate(); // the trigger bumped proposals.offers; within a second anywhere
    const moved = await get(etag);
    expect(moved.res.status).toBe(200);
    expect(moved.res.headers.get("ETag")).not.toBe(etag);
    await t.close();
  });

  it("the feed: a 304 reads nothing of the offers; an offer withdrawn is a 200", async () => {
    const log: string[] = [];
    const t = await testApp({ suite: "feed-revalidation", queryLog: log });
    const offerId = await t.seedBroadcastOffer();
    const get = async (etag?: string) => {
      log.length = 0;
      const res = await t.app.request("/v1/proposals", {
        headers: { Cookie: t.memberA.cookie, ...(etag ? { "If-None-Match": etag } : {}) },
      });
      return { res, reads: bodyReads(log) };
    };
    const first = await get();
    expect(first.res.status).toBe(200);
    const etag = first.res.headers.get("ETag")!;
    const again = await get(etag);
    expect(again.res.status).toBe(304);
    expect(again.reads).toEqual([]);

    const withdrawn = await t.app.request(`/v1/internal/offers/${offerId}/withdraw`, {
      method: "POST",
      headers: { "x-internal-secret": t.internalSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "test" }),
    });
    expect(withdrawn.status).toBeLessThan(300);
    t.platform.reference.generations.invalidate();
    const after = await get(etag);
    expect(after.res.status).toBe(200);
    expect(((await after.res.json()) as { items: { id: string }[] }).items.map((i) => i.id)).not.toContain(offerId);
    await t.close();
  });
});
