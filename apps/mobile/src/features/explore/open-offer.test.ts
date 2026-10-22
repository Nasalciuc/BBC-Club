import { describe, expect, it } from "bun:test";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { createTapGuard, offerFromParams, offerHref, openOffer } from "./open-offer";

const OFFER_ID = "6c23904e-b0c6-45e3-8da8-81138445551a";
const card = {
  id: OFFER_ID,
  route: { from: "KEF", to: "CDG" },
  cabin: "business",
  price: { offer: 1700, currency: "USD" },
} as unknown as ProposalCardVM;

describe("an offer card opens the offer itself (F067, F096)", () => {
  it("pushes the offer's own page at once — no search first, no catalogue fare in its place", () => {
    const pushed: unknown[] = [];
    const router = { push: (href: unknown) => void pushed.push(href) };
    const guard = createTapGuard();
    expect(openOffer(router, card, guard)).toBe(true);
    // Synchronous: the page is pushed before anything is awaited.
    expect(pushed).toEqual([
      {
        pathname: "/fare/[id]",
        params: { id: OFFER_ID, kind: "offer", from: "KEF", to: "CDG", cabin: "business" },
      },
    ]);
  });

  it("the page reads the offer back from its params, and nothing it cannot trust", () => {
    const href = offerHref(card) as unknown as { params: Record<string, string> };
    expect(offerFromParams(href.params)).toEqual({ id: OFFER_ID, from: "KEF", to: "CDG", cabin: "business" });
    expect(offerFromParams({ id: OFFER_ID })).toBeNull();
    expect(offerFromParams({ id: OFFER_ID, kind: "offer", from: "K", to: "CDG", cabin: "economy" })).toEqual({
      id: OFFER_ID,
      from: null,
      to: "CDG",
      cabin: null,
    });
  });
});

describe("createTapGuard — one navigation from a card at a time (F101)", () => {
  it("a second tap while the first is still in progress is ignored; one after it settles runs", async () => {
    const guard = createTapGuard();
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    let runs = 0;
    expect(guard.run(() => ((runs += 1), first))).toBe(true);
    expect(guard.run(() => (runs += 1))).toBe(false);
    expect(runs).toBe(1);
    release();
    await first;
    await Promise.resolve();
    expect(guard.run(() => (runs += 1))).toBe(true);
    expect(runs).toBe(2);
  });

  it("a push holds the guard until the screen is focused again (release), or a moment has passed", () => {
    let now = 1000;
    const guard = createTapGuard({ holdMs: 1000, now: () => now });
    let pushes = 0;
    expect(guard.run(() => (pushes += 1))).toBe(true);
    expect(guard.run(() => (pushes += 1))).toBe(false);
    guard.release();
    expect(guard.run(() => (pushes += 1))).toBe(true);
    now += 999;
    expect(guard.run(() => (pushes += 1))).toBe(false);
    now += 1;
    expect(guard.run(() => (pushes += 1))).toBe(true);
    expect(pushes).toBe(3);
  });

  it("two taps on a card push the page once", () => {
    const pushed: unknown[] = [];
    const router = { push: (href: unknown) => void pushed.push(href) };
    const guard = createTapGuard();
    openOffer(router, card, guard);
    openOffer(router, card, guard);
    expect(pushed).toHaveLength(1);
  });
});
