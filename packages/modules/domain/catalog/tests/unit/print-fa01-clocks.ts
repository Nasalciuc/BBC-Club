import { fixture } from "@bbc/shared/fixture";
import { fareFacts } from "../../../../../ui/src/cards/fare-facts";
import { toFareVM } from "../../src/application/to-fare-vm";

const vm = toFareVM(
  {
    id: fixture.fares[0]!.id,
    routeFrom: "JFK",
    routeTo: "LHR",
    cabin: "business",
    carrier: "BA",
    carrierName: "British Airways",
    product: "Lie-flat suite",
    nonstop: true,
    durationMinutes: 425,
    departAt: new Date("2026-10-12T22:55:00.000Z"),
    arriveAt: new Date("2026-10-13T06:00:00.000Z"),
    price: "4200.00",
    publishedPrice: "7850.00",
    publishedSource: "Sabre · 16 Sep",
    currency: "USD",
    source: "manual",
    validFrom: new Date("2026-09-01T00:00:00.000Z"),
    validUntil: new Date("2027-12-31T23:59:59.000Z"),
    published: true,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
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
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
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
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    },
  },
  true,
);

process.stdout.write(
  JSON.stringify({
    departLocal: vm.departLocal,
    arriveLocal: vm.arriveLocal,
    arriveDayOffset: vm.arriveDayOffset,
    facts: fareFacts(vm),
  }),
);
