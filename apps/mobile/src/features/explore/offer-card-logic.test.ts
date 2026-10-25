import { describe, expect, it } from "bun:test";
import type { DestinationPinVM, SiteDealVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { dealCardModel, dealDestination, homeDeals, offerCardModel, sheetExpandedState } from "./offer-card-logic";

describe("every offer (16) while Home loads — never 'No offers yet.' before it answered (ADR-IMPL-047)", () => {
  const card = { id: "x" } as unknown as ProposalCardVM;

  it("Home on its way: the cards' places, not the empty message", () => {
    expect(sheetExpandedState(null, true)).toBe("loading");
  });

  it("Home answered with no offer: the empty message; with offers: the offers", () => {
    expect(sheetExpandedState({ sections: [] }, false)).toBe("empty");
    expect(sheetExpandedState({ sections: [{ key: "inspire", title: "Offers to inspire", items: [] }] }, false)).toBe(
      "empty",
    );
    expect(sheetExpandedState({ sections: [{ key: "europe", title: "To Europe", items: [card] }] }, false)).toBe(
      "offers",
    );
    // A Home reloading over offers already shown keeps them.
    expect(
      sheetExpandedState({ sections: [{ key: "inspire", title: "Offers to inspire", items: [card] }] }, true),
    ).toBe("offers");
  });
});

const PARIS: DestinationPinVM = {
  code: "CDG",
  city: "Paris",
  name: "Charles de Gaulle",
  countryCode: "FR",
  lat: 49,
  lng: 2.5,
  fromPrice: 3850,
  hasOffer: true,
  region: "europe",
};

const offer = (to: string, price: ProposalCardVM["price"], rating?: number | null): ProposalCardVM => ({
  id: "da4947e7-7b1d-4042-8b4e-b62bc8c6c368",
  title: "Autumn in Paris",
  route: { from: "JFK", to },
  cabin: "business",
  price,
  validUntil: "2026-10-31T23:59:59.000Z",
  state: "unseen",
  targeting: "broadcast",
  rating,
});

describe("offerCardModel", () => {
  it("names the city and country of the route's arrival, with the saving on the published fare (02)", () => {
    expect(offerCardModel(offer("CDG", { offer: 3850, published: 6900, currency: "USD" }), [PARIS])).toEqual({
      city: "Paris",
      country: "France",
      fromPrice: "$3,850",
      savePercent: 44,
      rating: null,
    });
  });

  it("prints the offer's rating as given, to one decimal (02: 4.8); none without one", () => {
    expect(offerCardModel(offer("CDG", { offer: 3850, currency: "USD" }, 4.8), [PARIS]).rating).toBe("4.8");
    expect(offerCardModel(offer("CDG", { offer: 3850, currency: "USD" }, 5), [PARIS]).rating).toBe("5.0");
    expect(offerCardModel(offer("CDG", { offer: 3850, currency: "USD" }, null), [PARIS]).rating).toBeNull();
  });

  it("names the city from Home's places when no pin lists it — a broadcast offer seen from another airport (ADR-IMPL-057)", () => {
    const tokyo = { code: "HND", city: "Tokyo", countryCode: "JP" };
    expect(offerCardModel(offer("HND", { offer: 4650, currency: "USD" }), [PARIS], [tokyo])).toMatchObject({
      city: "Tokyo",
      country: "Japan",
    });
  });

  it("keeps the offer's own title where Home does not list its city, and says no saving without a published fare", () => {
    expect(offerCardModel(offer("NRT", { offer: 4650, currency: "USD" }), [PARIS])).toEqual({
      city: "Autumn in Paris",
      country: null,
      fromPrice: "$4,650",
      savePercent: null,
      rating: null,
    });
  });
});

// ADR-IMPL-067: the company site's deals after the member's own offers. Made-up prices.
const deal = (origin: { code: string; city: string }, amount = 1101): SiteDealVM => ({
  id: `site-9001-${origin.code}`,
  destination: {
    code: "LHR",
    city: "London",
    name: "Heathrow Airport",
    countryCode: "GB",
    lat: 51.47,
    lng: -0.45,
    photo: null,
  },
  origin,
  price: { amount, currency: "USD", basis: "site", from: true },
  validUntil: "2026-10-26T07:46:00.000Z",
});
const JFK_HOME = { code: "JFK", city: "New York" };

describe("dealCardModel (ADR-IMPL-067)", () => {
  it("the city, its country and `from` the site's price — never a saving, never a star", () => {
    expect(dealCardModel(deal(JFK_HOME), JFK_HOME)).toEqual({
      city: "London",
      country: "United Kingdom",
      fromPrice: "$1,101",
      savePercent: null,
      rating: null,
      origin: null,
    });
  });

  it("names the origin when the deal leaves from another city than the member's", () => {
    const seattle = { code: "SEA", city: "Seattle" };
    expect(dealCardModel(deal({ code: "SFO", city: "San Francisco" }), seattle).origin).toBe("from San Francisco");
    expect(dealCardModel(deal({ code: "IAD", city: "Washington" }), { code: "YYZ", city: "Toronto" }).origin).toBe(
      "from Washington",
    );
  });

  it("no line for the member's own airport or own city (Newark's member and New York's deal from JFK)", () => {
    expect(dealCardModel(deal({ code: "EWR", city: "New York" }), { code: "ewr", city: "Newark" }).origin).toBeNull();
    expect(dealCardModel(deal({ code: "JFK", city: "New York" }), { code: "LGA", city: "New York" }).origin).toBeNull();
  });

  it("names the origin when Home does not know the member's airport", () => {
    expect(dealCardModel(deal(JFK_HOME), null).origin).toBe("from New York");
  });
});

describe("the deals on Home (ADR-IMPL-067)", () => {
  it("none from a server without them, or before Home answered", () => {
    expect(homeDeals(null)).toEqual([]);
    expect(homeDeals({})).toEqual([]);
    expect(homeDeals({ deals: [deal(JFK_HOME)] }).map((d) => d.id)).toEqual(["site-9001-JFK"]);
  });

  it("every offer (16) shows the deals when the member has no offer of their own", () => {
    expect(sheetExpandedState({ sections: [], deals: [deal(JFK_HOME)] }, false)).toBe("offers");
    expect(sheetExpandedState({ sections: [], deals: [] }, false)).toBe("empty");
  });

  it("a tap chooses the deal's destination as a pin does: the airport, without the photo", () => {
    expect(dealDestination(deal(JFK_HOME))).toEqual({
      code: "LHR",
      city: "London",
      name: "Heathrow Airport",
      countryCode: "GB",
      lat: 51.47,
      lng: -0.45,
    });
  });
});
