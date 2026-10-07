import type { FareVM } from "@bbc/shared/api/v1/fares";
import { fixture } from "@bbc/shared/fixture";
import { toFareVM } from "../../src/application/to-fare-vm";

const now = new Date("2026-09-01T00:00:00.000Z");

export function mapFa01(): FareVM {
  const f = fixture.fares[0]!;
  return toFareVM(
    {
      id: f.id,
      routeFrom: f.from.code,
      routeTo: f.to.code,
      cabin: f.cabin,
      carrier: f.carrier.code,
      carrierName: f.carrier.name,
      product: f.product,
      nonstop: f.nonstop,
      durationMinutes: f.durationMinutes,
      departAt: f.departAt ? new Date(f.departAt) : null,
      arriveAt: f.arriveAt ? new Date(f.arriveAt) : null,
      price: String(f.price.offer),
      publishedPrice: f.price.published != null ? String(f.price.published) : null,
      publishedSource: f.price.publishedSource ?? null,
      currency: f.price.currency,
      source: "manual",
      validFrom: now,
      validUntil: new Date(f.validUntil),
      published: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      from: {
        code: "JFK",
        city: "New York",
        name: "John F. Kennedy International",
        country: "United States",
        countryCode: "US",
        region: "americas",
        lat: "40.641300",
        lng: "-73.778100",
        popularity: 100,
        tz: "America/New_York",
        searchTerms: null,
        createdAt: now,
      },
      to: {
        code: "LHR",
        city: "London",
        name: "Heathrow",
        country: "United Kingdom",
        countryCode: "GB",
        region: "europe",
        lat: "51.470000",
        lng: "-0.454300",
        popularity: 98,
        tz: "Europe/London",
        searchTerms: null,
        createdAt: now,
      },
    },
    f.hasOffer,
  );
}

export function fareFactsLine(
  fare: Pick<FareVM, "departLocal" | "arriveLocal" | "arriveDayOffset" | "durationMinutes">,
): string {
  const plus = fare.arriveDayOffset > 0 ? ` +${fare.arriveDayOffset}` : "";
  const m = fare.durationMinutes;
  const d = m == null ? null : `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, "0")}`;
  return `${fare.departLocal} — ${fare.arriveLocal}${plus}${d ? ` · ${d}` : ""}`;
}
