import { test, expect } from "bun:test";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { buildDraft, draftToBody, sheetTitle } from "./useRequestDraft";

const FARE_ID = "00000000-0000-4000-8000-000000000002";
const OFFER_ID = "00000000-0000-4000-8000-000000000003";

function fare(offerId: string | null): FareVM {
  return {
    id: FARE_ID,
    offerId,
    carrier: { code: "BA", name: "British Airways", logoUrl: null },
    from: { code: "JFK", city: "New York" },
    to: { code: "LHR", city: "London" },
    cabin: "business",
    product: null,
    nonstop: true,
    durationMinutes: 425,
    departAt: null,
    arriveAt: null,
    departLocal: "18:55",
    arriveLocal: "07:00",
    arriveDayOffset: 1,
    price: { offer: 4200, currency: "USD" },
    validUntil: "2026-10-01T00:00:00.000Z",
    hasOffer: offerId != null,
  };
}

test("a quote names itself and carries no fare", () => {
  const body = draftToBody(buildDraft({ mode: "quote", fromCode: "JFK", toCode: "LHR" }));
  expect(sheetTitle("quote")).toBe("Request a quote");
  expect(body.intent).toBe("quote");
  expect(body.fareId).toBeUndefined();
  expect(body.offerId).toBeUndefined();
  expect(body.replacesFareId).toBeUndefined();
});

test("an alternative names the fare it replaces", () => {
  const body = draftToBody(
    buildDraft({ mode: "alternative", replacesFareId: FARE_ID, fromCode: "JFK", toCode: "LHR" }),
  );
  expect(sheetTitle("alternative")).toBe("Request an alternative");
  expect(body.intent).toBe("alternative");
  expect(body.replacesFareId).toBe(FARE_ID);
  expect(body.fareId).toBeUndefined();
});

test("a search fare sends the fare id and no intent", () => {
  const body = draftToBody(buildDraft({ fare: fare(null) }));
  expect(body.intent).toBeUndefined();
  expect(body.fareId).toBe(FARE_ID);
  expect(body.offerId).toBeUndefined();
});

test("an offer sends the offer id and no intent", () => {
  const body = draftToBody(buildDraft({ fare: fare(OFFER_ID) }));
  expect(body.intent).toBeUndefined();
  expect(body.offerId).toBe(OFFER_ID);
  expect(body.fareId).toBeUndefined();
});
