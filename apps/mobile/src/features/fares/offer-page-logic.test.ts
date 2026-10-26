import { describe, expect, it } from "bun:test";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";
import { fixture } from "@bbc/shared/fixture";

import { offerFare } from "./offer-page-logic";

const offer: ProposalDetailVM = {
  id: "6c23904e-b0c6-45e3-8da8-81138445551a",
  title: "Your autumn in Paris",
  route: { from: "KEF", to: "CDG" },
  cabin: "business",
  price: { offer: 1700, published: 2400, publishedSource: "Sabre · 16 Sep", currency: "USD" },
  validUntil: "2026-11-30T00:00:00.000Z",
  state: "unseen",
  targeting: "personal",
  advisorName: "Julia",
};

const airFrance: FareVM = {
  ...fixture.fares[0]!,
  id: "6fc9ed38-4e6c-42a8-ab98-55e7299d8e38",
  carrier: { code: "AF", name: "Air France", logoUrl: null },
  from: { code: "KEF", city: "Reykjavík" },
  to: { code: "CDG", city: "Paris" },
  cabin: "business",
  product: "Business",
  nonstop: true,
  durationMinutes: 195,
  departAt: "2026-11-12T07:40:00.000Z",
  departLocal: "07:40",
  arriveLocal: "12:55",
  arriveDayOffset: 0,
  departDate: "2026-11-12",
  price: { offer: 1900.5, currency: "USD" },
  trip: "one_way",
};

describe("the offer's page (F067): the offer's price, never a catalogue fare's", () => {
  it("shows the offer's price pair and validity whatever the catalogue fare on the route costs", () => {
    const shown = offerFare(offer, airFrance);
    expect(shown.price).toEqual(offer.price);
    expect(shown.validUntil).toBe(offer.validUntil);
    expect(shown.offerId).toBe(offer.id);
    expect(shown.cabin).toBe("business");
    expect(shown.from).toEqual({ code: "KEF", city: "Reykjavík" });
    expect(shown.to).toEqual({ code: "CDG", city: "Paris" });
  });

  it("a catalogue fare on the route supplies the flight facts the offer lacks — never its day, trip or price", () => {
    const shown = offerFare(offer, airFrance);
    expect(shown.carrier).toEqual(airFrance.carrier);
    expect([shown.departLocal, shown.arriveLocal, shown.durationMinutes]).toEqual(["07:40", "12:55", 195]);
    // The offer is not that flight: no day of its own, and what its price buys is not the catalogue's to say.
    expect([shown.departAt, shown.departDate, shown.arriveAt]).toEqual([null, null, null]);
    expect(shown.trip).toBeUndefined();
  });

  it("the offer's own facts win; the catalogue adds only the airline's code and logo, when it is the same airline", () => {
    const withFacts = {
      ...offer,
      flightFacts: {
        nonstop: true,
        durationMinutes: 200,
        carrier: "Air France",
        departLocal: "09:10",
        arriveLocal: "14:30",
      },
    };
    const shown = offerFare(withFacts, airFrance);
    expect(shown.carrier).toEqual({ code: "AF", name: "Air France", logoUrl: null });
    expect([shown.departLocal, shown.arriveLocal, shown.durationMinutes]).toEqual(["09:10", "14:30", 200]);
    const other = offerFare(
      { ...withFacts, flightFacts: { ...withFacts.flightFacts, carrier: "Icelandair" } },
      airFrance,
    );
    expect(other.carrier).toEqual({ code: null, name: "Icelandair", logoUrl: null });
  });

  it("without a catalogue fare: the offer alone, the cities by the names known, else their codes", () => {
    const shown = offerFare(offer, null, { from: null, to: "Paris" });
    expect(shown.from).toEqual({ code: "KEF", city: "KEF" });
    expect(shown.to).toEqual({ code: "CDG", city: "Paris" });
    expect(shown.carrier.code).toBeNull();
    expect([shown.departLocal, shown.durationMinutes]).toEqual([null, null]);
  });

  it("a fare on another route or cabin supplies nothing", () => {
    const first = offerFare(offer, { ...airFrance, cabin: "first" });
    expect(first.departLocal).toBeNull();
    expect(first.from.city).toBe("KEF");
  });
});
