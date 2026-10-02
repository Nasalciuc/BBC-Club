import { describe, expect, test } from "bun:test";
import { deleteFailureKind, stateCopy, submitFailureKind } from "./error-context";

test("a gone fare uses the expired-fare copy", () => {
  expect(stateCopy("gone")).toEqual({
    title: "This fare has changed.",
    body: "This fare is no longer available. A specialist can help you find another option.",
  });
});

test("a failed send uses the not-sent copy", () => {
  expect(stateCopy("notSent").title).toBe("This request didn’t send.");
});

test("a wrong password stays on the confirm sheet", () => {
  expect(deleteFailureKind("INVALID_PASSWORD")).toBe("wrongPassword");
  expect(stateCopy("wrongPassword").title).toBe("That password isn’t right.");
});

test("a missing credential account is a generic delete failure", () => {
  expect(deleteFailureKind("CREDENTIAL_ACCOUNT_NOT_FOUND")).toBe("deleteFailed");
  expect(deleteFailureKind("UNKNOWN")).toBe("deleteFailed");
});

test("submit errors map to the sheet, the queue, or the limited screen", () => {
  expect(submitFailureKind("RATE_LIMITED")).toBe("rateLimited");
  expect(submitFailureKind("TIMEOUT")).toBe("queued");
  expect(submitFailureKind("OFFLINE")).toBe("queued");
  expect(submitFailureKind("VALIDATION")).toBe("notSent");
  expect(submitFailureKind(undefined)).toBe("notSent");
});

describe("system screens", () => {
  test("update required has no dismiss path in copy", () => {
    expect(stateCopy("update").title).toBe("We've improved the app.");
  });

  test("maintenance is temporary", () => {
    expect(stateCopy("maintenance").title).toBe("Back in a moment.");
  });
});
