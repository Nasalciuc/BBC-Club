import { describe, expect, test } from "bun:test";
import {
  notPassedOn,
  NOT_SENT,
  REQUEST_FILTERS,
  closedAt,
  closedLine,
  filterEmptyLine,
  inFilter,
  listAttention,
  progressSteps,
  recentRequests,
  requestView,
  serverState,
  shortDay,
  stepCaption,
  unreadQuotes,
} from "./request-view-logic";

describe("requestView — one image per state", () => {
  test("just received (30): the message, the number we call and the call", () => {
    const v = requestView("just_received");
    expect(v.badge).toBe("received");
    expect(v.notice).toEqual({
      title: "We have your request.",
      body: "A specialist will call shortly.",
      icon: "phone",
    });
    expect(v.caption).toBe("We have your travel details.");
    expect([v.titleBadge, v.callback, v.fare, v.call, v.sendNow]).toEqual([false, true, false, "specialist", false]);
  });

  test("received (30): the same page as just received — the call as 30 draws it (ADR-IMPL-056 §7)", () => {
    expect(requestView("received")).toEqual(requestView("just_received"));
  });

  test("specialist review: the message and the steps — no number to call yet", () => {
    const v = requestView("assigned");
    expect(v.badge).toBe("received");
    expect(v.notice).toEqual({ title: "A specialist is reviewing your request.", body: null, icon: "phone" });
    expect(v.caption).toBe("A specialist will call you shortly.");
    expect([v.callback, v.call]).toEqual([false, null]);
  });

  test("quote ready (11): the fare, the number we call and Call your specialist", () => {
    const v = requestView("quoted");
    expect(v.badge).toBe("quote_ready");
    expect(v.notice?.title).toBe("Your quote is ready.");
    expect(v.notice?.body).toBe("A specialist will call shortly to confirm the details.");
    expect(v.caption).toBe("Review the quote with your specialist.");
    expect([v.titleBadge, v.callback, v.fare, v.call]).toEqual([false, true, true, "specialist"]);
  });

  test("the fare shows on a quote ready only — no other state has one", () => {
    const withFare = [
      "received",
      "just_received",
      "assigned",
      "quoted",
      "booked",
      "closed",
      "queued",
      "not_sent",
      "rejected",
    ].filter((s) => requestView(s).fare);
    expect(withFare).toEqual(["quoted"]);
  });

  test("booked (31): the message, the number we call and the call (ADR-IMPL-056 §7)", () => {
    const v = requestView("booked");
    expect(v.badge).toBe("booked");
    expect(v.notice?.title).toBe("Your specialist completed this booking by phone.");
    expect(v.notice?.body).toBe("Your itinerary was sent by email.");
    expect(v.caption).toBe("Your specialist confirms your flights.");
    expect([v.titleBadge, v.callback, v.call]).toEqual([false, true, "specialist"]);
  });

  test("closed (33): the Closed badge by the title, the day it closed, the number we call and the call", () => {
    const v = requestView("closed", "2026-10-03T15:00:00.000Z", "UTC");
    expect(v.badge).toBe("closed");
    expect(v.titleBadge).toBe(true);
    expect(v.notice).toEqual({ title: "This request is closed.", body: null, icon: "info" });
    expect(v.closedLine).toBe("Closed  ·  Oct 3");
    expect([v.callback, v.call, v.sendNow]).toEqual([true, "specialist", false]);
  });

  test("waiting on the phone (32): Not sent by the title, saved, Send now", () => {
    const v = requestView("queued");
    expect(v.badge).toBe("not_sent");
    expect(v.titleBadge).toBe(true);
    expect(v.notice).toBe(NOT_SENT);
    expect(NOT_SENT).toEqual({
      title: "Saved on your phone.",
      body: "It goes out when you’re back online.",
      icon: "phone",
    });
    expect([v.sendNow, v.call, v.callback]).toEqual([true, null, false]);
  });

  test("not sent by the server, or refused for good: never 'saved on your phone' — call us", () => {
    for (const status of ["not_sent", "rejected"] as const) {
      const v = requestView(status, null, undefined, true);
      expect(v.badge).toBe("not_sent");
      expect(v.notice).toEqual(notPassedOn(status, true));
      expect([v.sendNow, v.call, v.titleBadge]).toEqual([false, "us", true]);
      expect(notPassedOn(status, true)).toEqual({
        title: "We couldn’t pass this on.",
        body: "Call us and we’ll take it from here.",
        icon: "phone",
      });
    }
  });

  test("without the club's line: never a call, nor the phone glyph that points at one", () => {
    for (const status of ["not_sent", "rejected"] as const) {
      const v = requestView(status);
      expect(v.notice).toEqual(notPassedOn(status, false));
      expect(v.notice?.icon).toBe("info");
      expect(`${v.notice?.title} ${v.notice?.body}`.toLowerCase()).not.toContain("call");
    }
  });

  test("without the club's line, one the server holds is not asked again: the club sends it once fixed (RUNBOOK)", () => {
    // A second request would be a second trip for the specialists, under another reference (Idempotency-Key).
    expect(requestView("not_sent").notice?.body).toBe(
      "We’ll try again as soon as we can. There’s no need to send it again.",
    );
    // One the server never had (400/409 to the phone's copy): only the member can send it.
    expect(requestView("rejected").notice?.body).toBe("Send your request again from Explore.");
  });

  test("a state this app does not know reads as received, with nothing it cannot say", () => {
    const v = requestView("on_hold");
    expect([v.badge, v.notice, v.call, v.callback]).toEqual(["received", null, null, false]);
  });
});

test("a request the club has not passed on yet is just received; its reference comes with the passing on", () => {
  expect(serverState({ status: "received", reference: "" })).toBe("just_received");
  expect(serverState({ status: "received", reference: "  " })).toBe("just_received");
  expect(serverState({ status: "received", reference: "R-B001" })).toBe("received");
  // Any other state is the server's own, with or without a reference.
  expect(serverState({ status: "not_sent", reference: "" })).toBe("not_sent");
  expect(serverState({ status: "quoted", reference: "R-B002" })).toBe("quoted");
});

describe("progressSteps — Received, Quote ready, Booked (11, 30–33)", () => {
  const made = "2026-10-16T14:00:00.000Z";
  const quotedAt = "2026-10-18T09:00:00.000Z";
  const states = (state: string, timeline: { status: string; at: string }[] = []) =>
    progressSteps(state, { createdAt: made, timeline }, "UTC").map((s) => s.state);

  test("received (30): at the first step, its day the day it was made", () => {
    const steps = progressSteps("received", { createdAt: made, timeline: [] }, "UTC");
    expect(steps.map((s) => [s.key, s.label, s.state, s.date])).toEqual([
      ["received", "Received", "current", "Oct 16"],
      ["quoted", "Quote ready", "todo", null],
      ["booked", "Booked", "todo", null],
    ]);
    expect(states("just_received")).toEqual(["current", "todo", "todo"]);
    expect(states("assigned")).toEqual(["current", "todo", "todo"]);
  });

  test("quote ready (11): received done, at the quote, each with its day", () => {
    const steps = progressSteps(
      "quoted",
      {
        createdAt: made,
        timeline: [
          { status: "received", at: made },
          { status: "quoted", at: quotedAt },
        ],
      },
      "UTC",
    );
    expect(steps.map((s) => [s.state, s.date])).toEqual([
      ["done", "Oct 16"],
      ["current", "Oct 18"],
      ["todo", null],
    ]);
  });

  test("a request quoted twice shows the second quote's day", () => {
    const steps = progressSteps(
      "quoted",
      {
        createdAt: made,
        timeline: [
          { status: "quoted", at: "2026-10-17T09:00:00.000Z" },
          { status: "quoted", at: quotedAt },
        ],
      },
      "UTC",
    );
    expect(steps[1]?.date).toBe("Oct 18");
  });

  test("booked (31): every step done; a step with no event keeps no day", () => {
    const steps = progressSteps(
      "booked",
      { createdAt: made, timeline: [{ status: "booked", at: "2026-10-20T09:00:00.000Z" }] },
      "UTC",
    );
    expect(steps.map((s) => [s.state, s.date])).toEqual([
      ["done", "Oct 16"],
      ["done", null],
      ["done", "Oct 20"],
    ]);
  });

  test("closed: the steps it reached, none current — never a step it did not reach", () => {
    expect(states("closed", [{ status: "closed", at: "2026-10-19T00:00:00.000Z" }])).toEqual(["done", "todo", "todo"]);
    expect(
      states("closed", [
        { status: "quoted", at: quotedAt },
        { status: "closed", at: "2026-10-19T00:00:00.000Z" },
      ]),
    ).toEqual(["done", "done", "todo"]);
    expect(states("closed", [{ status: "booked", at: quotedAt }])).toEqual(["done", "done", "done"]);
  });

  test("not sent (32): nothing reached yet, no day", () => {
    for (const state of ["queued", "not_sent", "rejected"]) {
      const steps = progressSteps(state, { createdAt: made, timeline: [] }, "UTC");
      expect(steps.map((s) => [s.state, s.date])).toEqual([
        ["todo", null],
        ["todo", null],
        ["todo", null],
      ]);
    }
  });

  test("the day the member lived it: 22:30 in New York is still Oct 15 there", () => {
    const late = progressSteps("received", { createdAt: "2026-10-16T02:30:00.000Z", timeline: [] }, "America/New_York");
    expect(late[0]?.date).toBe("Oct 15");
  });
});

describe("stepCaption — the specialist's note wins (ADR-IMPL-041)", () => {
  const at = "2026-10-18T09:00:00.000Z";
  test("no note: the club's words for the state", () => {
    expect(stepCaption("quoted", requestView("quoted"), [{ status: "quoted", note: null }])).toBe(
      "Review the quote with your specialist.",
    );
    expect(stepCaption("received", requestView("received"), [])).toBe("We have your travel details.");
  });

  test("a note on the state the request is at replaces them — the latest one", () => {
    const timeline = [
      { status: "received", at, note: "Asked for a window seat" },
      { status: "quoted", at, note: "Holding BA 117 until Friday" },
    ];
    expect(stepCaption("quoted", requestView("quoted"), timeline)).toBe("Holding BA 117 until Friday");
    // A request just received reads its `received` event's note.
    expect(stepCaption("just_received", requestView("just_received"), timeline)).toBe("Asked for a window seat");
  });

  test("a second quote without a note does not bring back the first quote's", () => {
    const timeline = [
      { status: "quoted", at, note: "First offer" },
      { status: "quoted", at, note: "  " },
    ];
    expect(stepCaption("quoted", requestView("quoted"), timeline)).toBe("Review the quote with your specialist.");
  });

  test("closed, on the phone or not passed on: at no step, so no note", () => {
    const timeline = [{ status: "closed", at, note: "Booked elsewhere" }];
    expect(stepCaption("closed", requestView("closed"), timeline)).toBeNull();
    expect(stepCaption("queued", requestView("queued"), [])).toBeNull();
  });
});

describe("closedAt, closedLine and shortDay", () => {
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
    expect(closedLine("not a date")).toBe("Closed");
  });

  test("the day the member lived it: 22:30 in New York is still Oct 2 there", () => {
    expect(closedLine("2026-10-03T02:30:00.000Z", "America/New_York")).toBe("Closed  ·  Oct 2");
    expect(closedLine("2026-10-03T02:30:00.000Z", "UTC")).toBe("Closed  ·  Oct 3");
    expect(shortDay(null)).toBeNull();
  });
});

describe("listAttention — the card over the list (28)", () => {
  test("nothing waiting: no card — a request just received is not a request that needs the member", () => {
    expect(listAttention([{ status: "received" }])).toBeNull();
    expect(listAttention([{ status: "quoted" }, { status: "booked" }])).toBeNull();
    expect(listAttention([])).toBeNull();
  });

  test("a request waiting on the phone is pointed at its Send now", () => {
    expect(listAttention([{ status: "queued" }, { status: "received" }])).toEqual({
      title: "One request needs your attention.",
      body: "Open your request to check the details and try again.",
    });
    expect(listAttention([{ status: "queued" }, { status: "not_sent" }])?.title).toBe(
      "2 requests need your attention.",
    );
  });

  test("one that will not go out by itself is pointed at the call — never at a retry that does not exist", () => {
    expect(listAttention([{ status: "not_sent" }], true)).toEqual({
      title: "One request needs your attention.",
      body: "Call us and we’ll take it from here.",
    });
    expect(listAttention([{ status: "rejected" }, { status: "not_sent" }], true)?.body).toBe(
      "Call us and we’ll take it from here.",
    );
  });

  test("without the club's line, as each detail says — never at a call, never a resend of what the server holds", () => {
    expect(listAttention([{ status: "not_sent" }])).toEqual({
      title: "One request needs your attention.",
      body: "We’ll try again as soon as we can. There’s no need to send it again.",
    });
    expect(listAttention([{ status: "not_sent" }, { status: "not_sent" }])?.body).toBe(
      "We’ll try again as soon as we can. There’s no need to send them again.",
    );
    expect(listAttention([{ status: "rejected" }])?.body).toBe("Send your request again from Explore.");
    expect(listAttention([{ status: "rejected" }, { status: "rejected" }])?.body).toBe(
      "Send your requests again from Explore.",
    );
    expect(listAttention([{ status: "rejected" }, { status: "not_sent" }], false)?.body).toBe(
      "Open each request to see what to do next.",
    );
  });
});

describe("the status filters (09)", () => {
  test("All, then one per badge a member can pick — Not sent shows under All only", () => {
    expect(REQUEST_FILTERS.map((f) => f.label)).toEqual(["All", "Quote ready", "Received", "Booked", "Closed"]);
    expect(inFilter("all", "not_sent")).toBe(true);
    expect(inFilter("quote_ready", "quote_ready")).toBe(true);
    expect(inFilter("received", "quote_ready")).toBe(false);
    expect(REQUEST_FILTERS.map((f) => f.key as string)).not.toContain("not_sent");
  });

  test("an empty filter says what there is none of", () => {
    expect(filterEmptyLine("quote_ready")).toBe("No quotes are ready yet.");
    expect(filterEmptyLine("closed")).toBe("No closed requests.");
  });
});

test("the Requests dot counts quotes ready", () => {
  expect(unreadQuotes([{ status: "quoted" }, { status: "received" }, { status: "quoted" }])).toBe(2);
  expect(unreadQuotes([])).toBe(0);
});

test("Profile's trips are the newest by date, whatever the list's order", () => {
  // As the server lists them: in progress first, newest first within each group (ADR-IMPL-042).
  const items = [
    { id: "open-mid", createdAt: "2026-01-03T00:00:00.000Z" },
    { id: "open-old", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "closed-newest", createdAt: "2026-01-06T00:00:00.000Z" },
    { id: "booked-new", createdAt: "2026-01-05T00:00:00.000Z" },
  ];
  expect(recentRequests(items, 3).map((r) => r.id)).toEqual(["closed-newest", "booked-new", "open-mid"]);
  expect(recentRequests(items)).toHaveLength(4);
  // The list itself is left as it was.
  expect(items.map((r) => r.id)).toEqual(["open-mid", "open-old", "closed-newest", "booked-new"]);
});
