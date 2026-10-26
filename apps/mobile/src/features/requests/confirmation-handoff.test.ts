import { beforeEach, describe, expect, it } from "bun:test";
import type { RequestVM } from "@bbc/shared/api/v1/requests";

import {
  type ConfirmationModel,
  CONFIRMATION_KEEP,
  clearConfirmations,
  confirmationFromRequest,
  confirmationRoute,
  putConfirmation,
  readConfirmation,
  sentRequestId,
} from "./confirmation-handoff";

const ID = "67a7f334-8c1d-4eb6-bff4-8d71d9deaaa3";
const model: ConfirmationModel = {
  source: "offer",
  city: "London",
  phone: "+1 212 555 0148",
  from: "JFK",
  to: "LHR",
  cabin: "business",
  trip: "round",
  dates: "Nov 3 – 10, 2026",
  travelers: "1 adult",
  carrier: { name: "British Airways", code: "BA", logoUrl: null },
  media: "https://images.example/offer.jpg",
};

beforeEach(() => clearConfirmations());

describe("the confirmation is handed over in memory, never in the URL (F014)", () => {
  it("put and read by the request's id; an unknown id reads nothing", () => {
    putConfirmation(ID, model);
    expect(readConfirmation(ID)).toEqual(model);
    // Read again (a re-render, React's double render in development): still there.
    expect(readConfirmation(ID)).toEqual(model);
    expect(readConfirmation("unknown")).toBeNull();
    expect(readConfirmation("")).toBeNull();
  });

  it("keeps only the last few", () => {
    for (let i = 0; i < CONFIRMATION_KEEP + 2; i++) putConfirmation(`k${i}`, model);
    expect(readConfirmation("k0")).toBeNull();
    expect(readConfirmation(`k${CONFIRMATION_KEEP + 1}`)).toEqual(model);
  });

  it("the page reads only its id and whether it was queued — params carrying a phone, a city or images are ignored", () => {
    const route = confirmationRoute({
      id: ID,
      queued: "0",
      phone: "+15550100",
      city: "Nowhere",
      media: "https://evil.example/a.png",
      logo: "https://evil.example/l.png",
      carrier: "Club",
    });
    expect(route).toEqual({ id: ID, queued: false, unreachable: false });
    expect(confirmationRoute({ id: ["a", "b"], queued: "1" })).toEqual({ id: "a", queued: true, unreachable: false });
    expect(confirmationRoute({})).toEqual({ id: "", queued: false, unreachable: false });
  });

  it("reads why a request was saved: the club not answering, only on a saved one", () => {
    expect(confirmationRoute({ id: "k", queued: "1", why: "unreachable" }).unreachable).toBe(true);
    expect(confirmationRoute({ id: "k", queued: "1", why: "offline" }).unreachable).toBe(false);
    expect(confirmationRoute({ id: ID, queued: "0", why: "unreachable" }).unreachable).toBe(false);
  });

  it("reads and opens only a request that was sent, by an id shaped as the server's — never a made-up one", () => {
    expect(sentRequestId({ id: ID, queued: false })).toBe(ID);
    // Saved offline: the server does not have it yet.
    expect(sentRequestId({ id: ID, queued: true })).toBeNull();
    // A link's own words are no request: `View request` opens nothing and nothing is read.
    expect(sentRequestId({ id: "../settings", queued: false })).toBeNull();
    expect(sentRequestId({ id: `${ID}/timeline`, queued: false })).toBeNull();
    expect(sentRequestId({ id: "", queued: false })).toBeNull();
  });

  it("without the hand-over (a relaunch, a link) the request itself is read — its server data, never a picture", () => {
    const vm = {
      id: ID,
      reference: "BBC-1",
      route: "JFK → LHR",
      city: "London",
      tripType: "round",
      phone: "+12125550148",
      dates: "Nov 3 – 10, 2026",
      cabin: "first",
      passengers: { adult: 2, child: 0, infant: 0 },
      priceAtRequest: 4200,
      carrier: { code: "BA", name: "British Airways" },
      status: "received",
      createdAt: "2026-10-22T10:00:00.000Z",
      timeline: [],
    } as unknown as RequestVM;
    expect(confirmationFromRequest(vm, "+1 212 555 0148")).toEqual({
      source: "search",
      city: "London",
      phone: "+1 212 555 0148",
      from: "JFK",
      to: "LHR",
      cabin: "first",
      trip: "round",
      dates: "Nov 3 – 10, 2026",
      travelers: "2 adults",
      carrier: { name: "British Airways", code: "BA", logoUrl: null },
      media: null,
    });
    const bare = confirmationFromRequest({ ...vm, route: "nonsense", city: null, carrier: null }, null);
    expect([bare.from, bare.to, bare.city, bare.carrier]).toEqual(["", "", "", null]);
  });
});
