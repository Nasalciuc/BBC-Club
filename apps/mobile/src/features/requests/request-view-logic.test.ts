import { expect, test } from "bun:test";
import { closedAt, listHints, requestView } from "./request-view-logic";

test("received is Received, with the sentence and the step caption of 233:4248", () => {
  const v = requestView("received");
  expect(v.badge).toBe("received");
  expect(v.showTimeline).toBe(true);
  expect(v.sentence).toBe("We have your request. A specialist will call shortly to discuss your flight.");
  expect(v.caption).toBe("We have your travel details.");
});

test("assigned is Received, with the specialist sentence and caption", () => {
  const v = requestView("assigned");
  expect(v.badge).toBe("received");
  expect(v.sentence).toBe("A specialist is reviewing your request.");
  expect(v.caption).toBe("A specialist will call you shortly.");
});

test("quoted is Quote ready", () => {
  const v = requestView("quoted");
  expect(v.badge).toBe("quote_ready");
  expect(v.sentence).toBe("Your quote is ready. A specialist will call shortly to confirm the details.");
  expect(v.caption).toBe("Review the quote with your specialist.");
});

test("booked is Booked by phone, with the sentence and the step caption of 233:4388", () => {
  const v = requestView("booked");
  expect(v.badge).toBe("booked");
  expect(v.showTimeline).toBe(true);
  expect(v.sentence).toBe("Your specialist completed this booking by phone. Your itinerary was sent by email.");
  expect(v.caption).toBe("Your specialist confirms your flights.");
});

test("the list's hint: one just-received request is reassured, anything not sent is pointed at", () => {
  expect(listHints([{ status: "received" }])).toEqual(["Your request is with us. A specialist will call shortly."]);
  expect(listHints([{ status: "received" }, { status: "quoted" }])).toEqual([]);
  expect(listHints([{ status: "quoted" }])).toEqual([]);
  expect(listHints([{ status: "not_sent" }, { status: "received" }])).toEqual([
    "One request needs your attention.",
    "Open your request to check the details and try again.",
  ]);
  expect(listHints([{ status: "queued" }, { status: "not_sent" }])[0]).toBe("2 requests need your attention.");
  expect(listHints([])).toEqual([]);
});

test("closedAt prefers the closed timeline event over createdAt", () => {
  const at = closedAt({
    createdAt: "2026-09-01T00:00:00.000Z",
    timeline: [
      { status: "received", at: "2026-09-01T00:00:00.000Z" },
      { status: "closed", at: "2026-10-03T15:00:00.000Z" },
    ],
  });
  expect(at).toBe("2026-10-03T15:00:00.000Z");
  expect(requestView("closed", at).closedLine).toBe("Closed · Oct 3");
});

test("closed is not Booked: no badge, no timeline, muted date", () => {
  const v = requestView("closed", "2026-10-03T15:00:00.000Z");
  expect(v.badge).toBeNull();
  expect(v.showTimeline).toBe(false);
  expect(v.sentence).toBe("This request is closed.");
  expect(v.closedLine).toBe("Closed · Oct 3");
});

test("not sent uses a straight apostrophe and a hollow timeline", () => {
  const v = requestView("not_sent");
  expect(v.badge).toBe("not_sent");
  expect(v.timelineStatus).toBe("queued");
  expect(v.sentence).toBe("Saved on your phone. It goes out when you're back online.");
  expect(v.sentence?.includes("\u2019")).toBe(false);
});
