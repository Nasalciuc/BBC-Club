import { describe, expect, test } from "bun:test";
import {
  NOT_PASSED_ON,
  NOT_SENT,
  closedAt,
  closedLine,
  listHints,
  recentRequests,
  requestView,
  unreadQuotes,
} from "./request-view-logic";

describe("requestView — one frame per state", () => {
  test("received (233:4248): the section's name, the number we call, no call yet", () => {
    const v = requestView("received");
    expect(v.badge).toBe("received");
    expect(v.showTimeline).toBe(true);
    expect(v.sentence).toBe("We have your request. A specialist will call shortly to discuss your flight.");
    expect(v.caption).toBe("We have your travel details.");
    expect([v.progressLabel, v.callback, v.call, v.sendNow, v.compact]).toEqual([true, true, null, false, false]);
  });

  test("specialist review (325:8136): the sentence and the timeline — no section name, no number yet", () => {
    const v = requestView("assigned");
    expect(v.badge).toBe("received");
    expect(v.sentence).toBe("A specialist is reviewing your request.");
    expect(v.caption).toBe("A specialist will call you shortly.");
    expect([v.progressLabel, v.callback, v.call, v.compact]).toEqual([false, false, null, false]);
  });

  test("quote ready (233:4171): the number we call and Call your specialist", () => {
    const v = requestView("quoted");
    expect(v.badge).toBe("quote_ready");
    expect(v.sentence).toBe("Your quote is ready. A specialist will call shortly to confirm the details.");
    expect(v.caption).toBe("Review the quote with your specialist.");
    expect([v.progressLabel, v.callback, v.call]).toEqual([true, true, "specialist"]);
  });

  test("booked (233:4388): the section's name, no number, no call", () => {
    const v = requestView("booked");
    expect(v.badge).toBe("booked");
    expect(v.sentence).toBe("Your specialist completed this booking by phone. Your itinerary was sent by email.");
    expect(v.caption).toBe("Your specialist confirms your flights.");
    expect([v.progressLabel, v.callback, v.call]).toEqual([true, false, null]);
  });

  test("closed (325:8229) is not Booked: no badge, no timeline, when it closed", () => {
    const v = requestView("closed", "2026-10-03T15:00:00.000Z", "UTC");
    expect(v.badge).toBeNull();
    expect(v.showTimeline).toBe(false);
    expect(v.sentence).toBe("This request is closed.");
    expect(v.closedLine).toBe("Closed · Oct 3");
  });

  test("waiting on the phone (325:8295): saved, quiet steps, Send now, 16 pt apart", () => {
    const v = requestView("queued");
    expect(v.badge).toBe("not_sent");
    expect(v.timelineStatus).toBe("queued");
    expect(v.sentence).toBe(NOT_SENT);
    expect(NOT_SENT).toBe("Saved on your phone. It goes out when you’re back online.");
    expect([v.progressLabel, v.sendNow, v.compact, v.call]).toEqual([false, true, true, null]);
  });

  test("not sent by the server, or refused for good: never 'saved on your phone' — call us", () => {
    for (const status of ["not_sent", "rejected"]) {
      const v = requestView(status);
      expect(v.badge).toBe("not_sent");
      expect(v.sentence).toBe(NOT_PASSED_ON);
      expect([v.sendNow, v.call, v.compact]).toEqual([false, "us", true]);
    }
  });
});

describe("closedAt and closedLine", () => {
  test("the latest closing: a request reopened and closed again shows the second date", () => {
    const at = closedAt({
      timeline: [
        { status: "received", at: "2026-09-01T00:00:00.000Z" },
        { status: "closed", at: "2026-09-20T12:00:00.000Z" },
        { status: "quoted", at: "2026-09-25T12:00:00.000Z" },
        { status: "closed", at: "2026-10-03T15:00:00.000Z" },
      ],
    });
    expect(at).toBe("2026-10-03T15:00:00.000Z");
  });

  test("no closing event: no date — the day it was made is not the day it closed", () => {
    expect(closedAt({ timeline: [{ status: "received", at: "2026-09-01T00:00:00.000Z" }] })).toBeNull();
    expect(closedLine(null)).toBe("Closed");
  });

  test("the day the member lived it: 22:30 in New York is still Oct 2 there", () => {
    expect(closedLine("2026-10-03T02:30:00.000Z", "America/New_York")).toBe("Closed · Oct 2");
    expect(closedLine("2026-10-03T02:30:00.000Z", "UTC")).toBe("Closed · Oct 3");
  });
});

describe("listHints — Figma 233:4639 / 240:5199", () => {
  test("one just-received request is reassured", () => {
    expect(listHints([{ status: "received" }])).toEqual(["Your request is with us. A specialist will call shortly."]);
    expect(listHints([{ status: "received" }, { status: "quoted" }])).toEqual([]);
    expect(listHints([{ status: "quoted" }])).toEqual([]);
    expect(listHints([])).toEqual([]);
  });

  test("a request waiting on the phone is pointed at its Send now", () => {
    expect(listHints([{ status: "queued" }, { status: "received" }])).toEqual([
      "One request needs your attention.",
      "Open your request to check the details and try again.",
    ]);
    expect(listHints([{ status: "queued" }, { status: "not_sent" }])[0]).toBe("2 requests need your attention.");
  });

  test("one that will not go out by itself is pointed at the call — never at a retry that does not exist", () => {
    expect(listHints([{ status: "not_sent" }])).toEqual([
      "One request needs your attention.",
      "Call us and we’ll take it from here.",
    ]);
    expect(listHints([{ status: "rejected" }, { status: "not_sent" }])[1]).toBe("Call us and we’ll take it from here.");
  });
});

test("the Requests dot counts quotes ready", () => {
  expect(unreadQuotes([{ status: "quoted" }, { status: "received" }, { status: "quoted" }])).toBe(2);
  expect(unreadQuotes([])).toBe(0);
});

test("Profile's recent requests are the newest three by date, whatever the list's order", () => {
  // As the server lists them: in progress first, newest first within each group (ADR-IMPL-042).
  const items = [
    { id: "open-mid", createdAt: "2026-01-03T00:00:00.000Z" },
    { id: "open-old", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "closed-newest", createdAt: "2026-01-06T00:00:00.000Z" },
    { id: "booked-new", createdAt: "2026-01-05T00:00:00.000Z" },
  ];
  expect(recentRequests(items).map((r) => r.id)).toEqual(["closed-newest", "booked-new", "open-mid"]);
  // The list itself is left as it was.
  expect(items.map((r) => r.id)).toEqual(["open-mid", "open-old", "closed-newest", "booked-new"]);
});
