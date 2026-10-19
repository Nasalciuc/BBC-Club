import { describe, expect, it } from "bun:test";
import type { DestinationPinVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { offerCardModel } from "./offer-card-logic";

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

const offer = (to: string, price: ProposalCardVM["price"]): ProposalCardVM => ({
  id: "da4947e7-7b1d-4042-8b4e-b62bc8c6c368",
  title: "Autumn in Paris",
  route: { from: "JFK", to },
  cabin: "business",
  price,
  validUntil: "2026-10-31T23:59:59.000Z",
  state: "unseen",
  targeting: "broadcast",
});

describe("offerCardModel", () => {
  it("names the city and country of the route's arrival, with the saving on the published fare (02)", () => {
    expect(offerCardModel(offer("CDG", { offer: 3850, published: 6900, currency: "USD" }), [PARIS])).toEqual({
      city: "Paris",
      country: "France",
      fromPrice: "$3,850",
      savePercent: 44,
    });
  });

  it("keeps the offer's own title where Home does not list its city, and says no saving without a published fare", () => {
    expect(offerCardModel(offer("NRT", { offer: 4650, currency: "USD" }), [PARIS])).toEqual({
      city: "Autumn in Paris",
      country: null,
      fromPrice: "$4,650",
      savePercent: null,
    });
  });
});
