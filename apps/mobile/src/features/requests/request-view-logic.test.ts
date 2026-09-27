import { expect, test } from "bun:test";
import { closedAt, requestView } from "./request-view-logic";

test("received stays Received with no invented caption", () => {
  const v = requestView("received");
  expect(v.badge).toBe("received");
  expect(v.showTimeline).toBe(true);
  expect(v.caption).toBeNull();
  expect(v.sentence).toBeNull();
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

test("booked is Booked by phone, with no invented caption", () => {
  const v = requestView("booked");
  expect(v.badge).toBe("booked");
  expect(v.showTimeline).toBe(true);
  expect(v.caption).toBeNull();
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
