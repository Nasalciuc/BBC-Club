import { describe, expect, it } from "bun:test";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import {
  NOT_SENT_LINE,
  cardLines,
  detailFacts,
  queuedView,
  requestCard,
  requestTitle,
  spokenCard,
  travelersLine,
} from "./request-card";

const round = [
  { from: "JFK", to: "LHR", date: "2026-10-12" },
  { from: "LHR", to: "JFK", date: "2026-10-19" },
];

describe("travelersLine", () => {
  it("one adult, as the frames show it", () => {
    expect(travelersLine({ adult: 1, child: 0, infant: 0 })).toBe("1 ADULT");
  });
  it("names every kind of traveler there is", () => {
    expect(travelersLine({ adult: 2, child: 1, infant: 1 })).toBe("2 ADULTS · 1 CHILD · 1 INFANT");
    expect(travelersLine({ adult: 1, child: 2, infant: 0 })).toBe("1 ADULT · 2 CHILDREN");
  });
});

const london = {
  route: "JFK → LHR",
  city: "London",
  cabin: "business" as const,
  dates: "Oct 12–19",
  passengers: { adult: 1, child: 0, infant: 0 },
};

describe("cardLines — Figma 233:4069", () => {
  it("London · JFK → LHR · BUSINESS · OCT 12–19 · 1 ADULT", () => {
    expect(cardLines(london)).toEqual({
      title: "London",
      facts: "JFK → LHR · BUSINESS",
      when: "OCT 12–19 · 1 ADULT",
    });
  });
  it("first class says so", () => {
    expect(cardLines({ ...london, cabin: "first" }).facts).toBe("JFK → LHR · FIRST");
  });
  it("waiting on the phone: the details are saved (240:5199)", () => {
    expect(cardLines(london, { waiting: true }).when).toBe(NOT_SENT_LINE);
  });
  it("closed: when it closed", () => {
    expect(cardLines(london, { closedLine: "Closed · Oct 3" }).when).toBe("CLOSED · OCT 3");
  });
  it("an older server sends no city: the route is the title", () => {
    expect(requestTitle({ route: "JFK → LHR" })).toBe("JFK → LHR");
    expect(requestTitle({ route: "JFK → LHR", city: null })).toBe("JFK → LHR");
    expect(requestTitle({ route: "JFK → LHR", city: "  " })).toBe("JFK → LHR");
    expect(requestTitle({ route: "" })).toBe("Your request");
  });
  it("never a route that comes back where it started — an older server read every round trip as JFK → JFK", () => {
    expect(requestTitle({ route: "JFK → JFK" })).toBe("Your request");
    expect(requestTitle({ route: "JFK → JFK", city: "London" })).toBe("London");
  });
});

describe("detailFacts — Figma 233:4171 / 233:4248", () => {
  it("a round trip says so", () => {
    expect(detailFacts({ ...london, tripType: "round" })).toBe("JFK → LHR · OCT 12–19 · ROUND TRIP · 1 ADULT");
  });
  it("one way names no trip type", () => {
    expect(
      detailFacts({
        route: "JFK → CDG",
        dates: "Nov 3",
        tripType: "oneway",
        passengers: { adult: 2, child: 0, infant: 0 },
      }),
    ).toBe("JFK → CDG · NOV 3 · 2 ADULTS");
  });
  it("an older server sends no trip type", () => {
    expect(detailFacts(london)).toBe("JFK → LHR · OCT 12–19 · 1 ADULT");
  });
});

describe("queuedView", () => {
  const q = {
    id: "q_00000000-0000-4000-8000-000000000001",
    enqueuedAt: "2026-10-08T12:00:00.000Z",
    body: {
      tripType: "round" as const,
      cabin: "business" as const,
      legs: round,
      passengers: { adult: 1, child: 0, infant: 0 },
      contact: { phone: "+12125550148" },
    },
  };
  it("reads like the server's answer: not sent, the outbound route, its dates", () => {
    expect(queuedView({ ...q, city: "London" })).toMatchObject({
      id: q.id,
      route: "JFK → LHR",
      city: "London",
      tripType: "round",
      phone: "+12125550148",
      dates: "Oct 12–19",
      status: "not_sent",
      priceAtRequest: null,
      timeline: [],
    });
  });
  it("an item queued before the city was kept has none", () => {
    expect(queuedView(q).city).toBeNull();
  });
  it("reads its route and dates with the server's own functions — one way, multi-city, a same-day return", () => {
    const oneWay = { ...q, body: { ...q.body, tripType: "oneway" as const, legs: round.slice(0, 1) } };
    expect([queuedView(oneWay).route, queuedView(oneWay).dates]).toEqual(["JFK → LHR", "Oct 12"]);
    const tour = [
      { from: "JFK", to: "LHR", date: "2026-10-12" },
      { from: "LHR", to: "CDG", date: "2026-10-15" },
      { from: "CDG", to: "JFK", date: "2026-10-19" },
    ];
    expect(queuedView({ ...q, body: { ...q.body, tripType: "multi" as const, legs: tour } }).route).toBe("JFK → CDG");
    const sameDay = [
      { from: "JFK", to: "BOS", date: "2026-10-12" },
      { from: "BOS", to: "JFK", date: "2026-10-12" },
    ];
    expect(queuedView({ ...q, body: { ...q.body, legs: sameDay } }).dates).toBe("Oct 12");
  });
});

describe("requestCard — the same card on Requests and Profile", () => {
  const base = {
    ...london,
    createdAt: "2026-09-18T12:00:00.000Z",
    timeline: [] as RequestVM["timeline"],
  };
  it("received: its dates and travelers, its badge, and what a screen reader says", () => {
    expect(requestCard({ ...base, status: "received" })).toEqual({
      title: "London",
      facts: "JFK → LHR · BUSINESS",
      when: "OCT 12–19 · 1 ADULT",
      badge: "received",
      spoken: "London, received, JFK to LHR, business, October 12 to 19, 1 adult",
    });
    expect(requestCard({ ...base, status: "quoted" }).badge).toBe("quote_ready");
  });
  it("closed: when it closed, no badge — never mistaken for an open request", () => {
    const closed = requestCard(
      {
        ...base,
        status: "closed",
        timeline: [{ status: "closed", at: "2026-10-03T12:00:00.000Z", note: null }],
      },
      "UTC",
    );
    expect([closed.when, closed.badge]).toEqual(["CLOSED · OCT 3", null]);
    expect(closed.spoken).toBe("London, JFK to LHR, business, closed, October 3");
  });
  it("closed: the day it closed where the phone is", () => {
    const late = {
      ...base,
      status: "closed" as const,
      timeline: [{ status: "closed" as const, at: "2026-10-03T23:30:00.000Z", note: null }],
    };
    expect(requestCard(late, "America/New_York").when).toBe("CLOSED · OCT 3");
    expect(requestCard(late, "Pacific/Auckland").when).toBe("CLOSED · OCT 4");
  });
  it("closed with no closing event: Closed, never the day it was made", () => {
    expect(requestCard({ ...base, status: "closed" }).when).toBe("CLOSED");
  });
  it("waiting on the phone: the details are saved", () => {
    const waiting = requestCard({ ...base, status: "not_sent" }, undefined, "queued");
    expect(waiting).toMatchObject({ when: NOT_SENT_LINE, badge: "not_sent" });
    expect(waiting.spoken).toBe("London, not sent, JFK to LHR, business, your travel details are saved");
  });
  it("one that will not go out by itself — refused for good, or given up by the server — keeps its dates", () => {
    // Its detail says "We couldn’t pass this on": the card never says it is saved and on its way.
    for (const card of [
      requestCard({ ...base, status: "not_sent" }, undefined, "rejected"),
      requestCard({ ...base, status: "not_sent" }),
    ]) {
      expect(card).toMatchObject({ when: "OCT 12–19 · 1 ADULT", badge: "not_sent" });
      expect(card.spoken).toBe("London, not sent, JFK to LHR, business, October 12 to 19, 1 adult");
    }
  });
});

describe("spokenCard — words, not the mono signs", () => {
  it("names months, says to for the dash, and never reads an arrow or a middle dot", () => {
    const spoken = spokenCard(
      { ...london, dates: "Oct 30–Nov 6", passengers: { adult: 2, child: 1, infant: 0 } },
      { badge: "quote_ready" },
    );
    expect(spoken).toBe("London, quote ready, JFK to LHR, business, October 30 to November 6, 2 adults, 1 child");
    expect(spoken).not.toMatch(/[→·–]/);
  });
  it("a request waiting on the phone says its details are saved", () => {
    expect(spokenCard(london, { badge: "not_sent", waiting: true })).toBe(
      "London, not sent, JFK to LHR, business, your travel details are saved",
    );
  });
  it("a title that fell back to the route is read as words too", () => {
    expect(spokenCard({ ...london, city: null }, { badge: "not_sent", waiting: true })).toBe(
      "JFK to LHR, not sent, JFK to LHR, business, your travel details are saved",
    );
  });
});
