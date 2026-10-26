import { describe, expect, it } from "bun:test";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import {
  NOT_SENT_LINE,
  detailLines,
  detailTitle,
  queuedView,
  requestCard,
  requestTitle,
  routeCodes,
  spacedDates,
  spokenDates,
  travelersText,
  tripText,
} from "./request-card";

const round = [
  { from: "JFK", to: "LHR", date: "2026-10-12" },
  { from: "LHR", to: "JFK", date: "2026-10-19" },
];

describe("the card's facts (09)", () => {
  it("travelers in words: one adult, and every kind of traveler there is", () => {
    expect(travelersText({ adult: 1, child: 0, infant: 0 })).toBe("1 adult");
    expect(travelersText({ adult: 2, child: 1, infant: 1 })).toBe("2 adults · 1 child · 1 infant");
    expect(travelersText({ adult: 1, child: 2, infant: 0 })).toBe("1 adult · 2 children");
  });
  it("the trip as the images name it; nothing when an older server did not say", () => {
    expect([tripText("round"), tripText("oneway"), tripText("multi"), tripText(undefined)]).toEqual([
      "Round trip",
      "One way",
      "Multi-city",
      null,
    ]);
  });
  it("the server's days with room around the dash — and no year made up", () => {
    expect(spacedDates("Oct 12–19")).toBe("Oct 12 – 19");
    expect(spacedDates("Oct 30–Nov 6")).toBe("Oct 30 – Nov 6");
    expect(spacedDates("Nov 3")).toBe("Nov 3");
    expect(spacedDates("  ")).toBeNull();
  });
  it("the route's airports, or nothing when it says nothing usable", () => {
    expect(routeCodes("JFK → LHR")).toEqual({ from: "JFK", to: "LHR" });
    expect(routeCodes("")).toBeNull();
    expect(routeCodes("JFK")).toBeNull();
  });
});

const london = {
  route: "JFK → LHR",
  city: "London",
  cabin: "business" as const,
  dates: "Oct 12–19",
  tripType: "round" as const,
  passengers: { adult: 1, child: 0, infant: 0 },
};

describe("titles", () => {
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
  it("the detail (11): New York to London — the origin's code while its city is unknown", () => {
    expect(detailTitle(london, "New York")).toBe("New York to London");
    expect(detailTitle(london, null)).toBe("JFK to London");
    expect(detailTitle({ ...london, city: null }, "New York")).toBe("JFK → LHR");
  });
});

describe("detailLines (11, 30–33)", () => {
  it("the days and the trip, then the route and the travelers, the dot set wide as the images do", () => {
    expect(detailLines(london)).toEqual(["Oct 12 – 19  ·  Round trip", "JFK → LHR  ·  1 adult"]);
  });
  it("the airline the request was made for, when the server recorded one (11)", () => {
    expect(detailLines({ ...london, carrier: { name: "British Airways" } })).toEqual([
      "Oct 12 – 19  ·  Round trip",
      "JFK → LHR  ·  British Airways  ·  1 adult",
    ]);
    expect(detailLines({ ...london, carrier: { name: "  " } })[1]).toBe("JFK → LHR  ·  1 adult");
  });
  it("an older server's missing trip type is left out", () => {
    expect(detailLines({ ...london, tripType: undefined })).toEqual(["Oct 12 – 19", "JFK → LHR  ·  1 adult"]);
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
  it("reads like the server's answer: not sent, the outbound route, its dates with the year (28)", () => {
    expect(queuedView({ ...q, city: "London" })).toMatchObject({
      id: q.id,
      route: "JFK → LHR",
      city: "London",
      tripType: "round",
      phone: "+12125550148",
      dates: "Oct 12–19, 2026",
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
    expect([queuedView(oneWay).route, queuedView(oneWay).dates]).toEqual(["JFK → LHR", "Oct 12, 2026"]);
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
    expect(queuedView({ ...q, body: { ...q.body, legs: sameDay } }).dates).toBe("Oct 12, 2026");
  });
});

describe("requestCard — the card on Requests (09, 28)", () => {
  const base = {
    ...london,
    createdAt: "2026-09-18T12:00:00.000Z",
    timeline: [] as RequestVM["timeline"],
  };
  it("received: the city, its state, the route, the days, the trip and the travelers — and what is said", () => {
    expect(requestCard({ ...base, status: "received" })).toEqual({
      city: "London",
      route: "JFK → LHR",
      dates: "Oct 12 – 19",
      trip: "Round trip",
      travelers: "1 adult",
      note: null,
      badge: "received",
      spoken: "London, received, JFK to LHR, October 12 to 19, round trip, 1 adult",
      to: "LHR",
    });
    expect(requestCard({ ...base, status: "quoted" }).badge).toBe("quote_ready");
    expect(requestCard({ ...base, status: "booked" }).badge).toBe("booked");
  });
  it("closed: the Closed badge and its days (09) — never mistaken for an open request", () => {
    const closed = requestCard(
      { ...base, status: "closed", timeline: [{ status: "closed", at: "2026-10-03T12:00:00.000Z", note: null }] },
      "UTC",
    );
    expect([closed.badge, closed.dates, closed.note]).toEqual(["closed", "Oct 12 – 19", null]);
    expect(closed.spoken).toBe("London, closed, JFK to LHR, October 12 to 19, round trip, 1 adult");
  });
  it("waiting on the phone (28): Not sent, and the details are saved", () => {
    const waiting = requestCard({ ...base, status: "not_sent" }, undefined, "queued");
    expect(waiting).toMatchObject({ note: NOT_SENT_LINE, badge: "not_sent" });
    expect(waiting.spoken).toBe(
      "London, not sent, JFK to LHR, October 12 to 19, your travel details are saved, round trip, 1 adult",
    );
  });
  it("one that will not go out by itself — refused for good, or given up by the server — says nothing more", () => {
    // Its detail says "We couldn’t pass this on": the card never says it is saved and on its way.
    for (const card of [
      requestCard({ ...base, status: "not_sent" }, undefined, "rejected"),
      requestCard({ ...base, status: "not_sent" }),
    ]) {
      expect(card).toMatchObject({ note: null, badge: "not_sent", dates: "Oct 12 – 19" });
    }
  });
  it("words, never the signs: months named, to for the dash and the arrow, commas for the dots", () => {
    const card = requestCard({
      ...base,
      dates: "Oct 30–Nov 6",
      passengers: { adult: 2, child: 1, infant: 0 },
      status: "quoted",
    });
    expect(card.spoken).toBe(
      "London, quote ready, JFK to LHR, October 30 to November 6, round trip, 2 adults, 1 child",
    );
    expect(card.spoken).not.toMatch(/[→·–]/);
    expect(spokenDates("Nov 12 – 19")).toBe("November 12 to 19");
  });
  it("a title that fell back to the route is read as words too", () => {
    expect(requestCard({ ...base, city: null, status: "received" }).spoken.startsWith("JFK to LHR, received")).toBe(
      true,
    );
  });
});
