/**
 * ADR-IMPL-067: HomeVM.deals is additive both ways — an app built before it parses Home as ever, a Home without it
 * parses in this app, and a deal this app cannot read is left out without taking the others with it. A deal never
 * carries a reference price. Made-up prices.
 */
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { AirportVM, DestinationPinVM, HomePlaceVM, HomeVM, SiteDealVM } from "@bbc/shared/api/v1/fares";
import { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

const deal = (over: Record<string, unknown> = {}) => ({
  id: "site-9001-JFK",
  destination: {
    code: "LHR",
    city: "London",
    name: "Heathrow Airport",
    countryCode: "GB",
    lat: 51.47,
    lng: -0.45,
    tz: "Europe/London",
    description: null,
    photo: {
      card: "https://upload.wikimedia.org/c.jpg",
      hero: "https://upload.wikimedia.org/h.jpg",
      credit: { source: "wikimedia", author: "A. Person", license: "CC BY-SA 4.0", link: "https://example.org/x" },
    },
  },
  origin: { code: "JFK", city: "New York" },
  price: { amount: 1101, currency: "USD", basis: "site", from: true },
  validUntil: "2026-10-26T07:46:00.000Z",
  ...over,
});
const home = (deals: unknown) => ({ home: null, destinations: [], sections: [], deals });

/** Home as an app built before ADR-IMPL-067 parses it: no `deals` in its schema. */
const HomeBefore = z.object({
  home: AirportVM.nullable(),
  destinations: z.array(DestinationPinVM),
  sections: z.array(z.object({ key: z.string(), title: z.string(), items: z.array(ProposalCardVM) })),
  places: z.array(HomePlaceVM).optional(),
});

describe("HomeVM.deals (ADR-IMPL-067)", () => {
  it("an app built before deals parses a Home that has them, and drops them", () => {
    const parsed = HomeBefore.safeParse(home([deal()]));
    expect(parsed.success).toBe(true);
    expect(parsed.success && "deals" in parsed.data).toBe(false);
  });

  it("a Home without deals parses: none", () => {
    expect(HomeVM.parse({ home: null, destinations: [], sections: [] }).deals).toBeUndefined();
  });

  it("reads a deal whole: its destination as an airport, its photo and credit, its origin, a starting site price", () => {
    const [d] = HomeVM.parse(home([deal()])).deals ?? [];
    expect(d).toMatchObject({
      id: "site-9001-JFK",
      destination: { code: "LHR", city: "London", countryCode: "GB", photo: { credit: { source: "wikimedia" } } },
      origin: { code: "JFK", city: "New York" },
      price: { amount: 1101, currency: "USD", basis: "site", from: true },
    });
  });

  it("a deal this app cannot read is left out; the others stay; a list that is not one reads as none", () => {
    const bad = [
      deal({ price: { amount: 1101, currency: "USD", basis: "formula", from: true } }), // not the site's
      deal({ price: { amount: 1101, currency: "USD", basis: "site", from: false } }), // not a starting price
      deal({ price: { amount: 1101, currency: "EUR", basis: "site", from: true } }),
      deal({ price: { amount: 0, currency: "USD", basis: "site", from: true } }),
      deal({ validUntil: "tomorrow" }),
      deal({ origin: { code: "NEWYORK", city: "New York" } }),
      "a deal",
      null,
    ];
    const parsed = HomeVM.parse(home([...bad, deal({ id: "site-9002-JFK" })]));
    expect(parsed.deals?.map((d) => d.id)).toEqual(["site-9002-JFK"]);
    expect(HomeVM.parse(home({ not: "a list" })).deals).toBeUndefined();
  });

  it("a photo this app cannot read is no photo, never the deal (plain http, a kind of its own)", () => {
    const http = deal({
      destination: { ...deal().destination, photo: { card: "http://x.test/c.jpg", hero: "http://x.test/h.jpg" } },
    });
    const [d] = HomeVM.parse(home([http])).deals ?? [];
    expect(d?.destination.photo).toBeNull();
    expect(d?.id).toBe("site-9001-JFK");
  });

  it("never a reference price: whatever a server adds beside the price, the deal carries none of it", () => {
    const [d] =
      HomeVM.parse(
        home([deal({ price: { amount: 1101, currency: "USD", basis: "site", from: true, published: 2101 } })]),
      ).deals ?? [];
    expect(d?.price).toEqual({ amount: 1101, currency: "USD", basis: "site", from: true });
    expect(Object.keys(SiteDealVM.shape.price.shape).sort()).toEqual(["amount", "basis", "currency", "from"]);
  });
});
