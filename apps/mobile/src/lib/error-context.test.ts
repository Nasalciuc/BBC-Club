import { describe, expect, test } from "bun:test";
import {
  UNREACHABLE_MESSAGE,
  classifyFetchFailure,
  deleteFailureKind,
  passwordChangedNotice,
  readFailureCopy,
  refreshFailedLine,
  stateCopy,
  submitFailureKind,
} from "./error-context";

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
  test("Figma's page-wide messages, word for word", () => {
    expect(stateCopy("route")).toEqual({
      title: "Something didn’t load.",
      body: "We couldn’t load this page. Please try again.",
    });
    expect(stateCopy("update")).toEqual({
      title: "A new version is ready.",
      body: "Update BuyBusinessClass to continue exploring and requesting fares.",
    });
    expect(stateCopy("maintenance").title).toBe("We’ll be back shortly.");
  });
});

test("a screen that reads requests offline says when it will load — never the sending copy", () => {
  expect(readFailureCopy("OFFLINE", "requests")).toEqual({
    title: "You’re offline.",
    body: "Your requests load when you’re back online.",
  });
  // A timeout is not offline: the phone is online, and no reconnect will reload the list (ADR-IMPL-047).
  expect(readFailureCopy("TIMEOUT", "requests")).toEqual(stateCopy("route"));
  expect(readFailureCopy("NOT_FOUND", "request")).toEqual(stateCopy("route"));
  expect(readFailureCopy(undefined, "requests").body).not.toContain("send");
});

test("a page that does not reload by itself promises nothing: offline, Try again; a timeout, the page's message", () => {
  for (const what of ["request", "explore", "profile", "fare"] as const) {
    expect(readFailureCopy("OFFLINE", what)).toEqual({
      title: "You’re offline.",
      body: "Try again when you’re back online.",
    });
    expect(readFailureCopy("TIMEOUT", what)).toEqual(stateCopy("route"));
    expect(readFailureCopy("INTERNAL", what)).toEqual(stateCopy("route"));
  }
  for (const what of ["request", "requests", "explore", "profile", "fare"] as const) {
    expect(readFailureCopy("OFFLINE", what).body).not.toContain("send");
  }
});

test("over a list already on screen, a failed reload never says the screen could not be loaded", () => {
  expect(refreshFailedLine("OFFLINE")).toBe("You’re offline. Your requests load when you’re back online.");
  expect(refreshFailedLine("INTERNAL")).toBe("We couldn’t refresh your requests just now.");
  // Nothing loaded yet, only what waits on the phone on screen: there was nothing to refresh.
  expect(refreshFailedLine("INTERNAL", false)).toBe("We couldn’t load your other requests just now.");
  expect(refreshFailedLine("TIMEOUT", false)).toBe("We couldn’t load your other requests just now.");
  expect(refreshFailedLine("TIMEOUT")).toBe("We couldn’t refresh your requests just now.");
  expect(refreshFailedLine(undefined)).not.toContain("could not be loaded");
});

describe("a call that reached no server while the phone is online is not 'offline' (F110)", () => {
  test("the platform decides: offline only when it says the phone is off the network", () => {
    expect(classifyFetchFailure({ isConnected: false, isInternetReachable: null })).toBe("OFFLINE");
    expect(classifyFetchFailure({ isConnected: true, isInternetReachable: false })).toBe("OFFLINE");
    expect(classifyFetchFailure({ isConnected: false })).toBe("OFFLINE");
    // Online, or not yet known: the club's server is what did not answer (DNS, TLS, the server down).
    expect(classifyFetchFailure({ isConnected: true, isInternetReachable: true })).toBe("UNREACHABLE");
    expect(classifyFetchFailure({ isConnected: true, isInternetReachable: null })).toBe("UNREACHABLE");
    expect(classifyFetchFailure(null)).toBe("UNREACHABLE");
  });

  test("a page that could not reach the club says so, never 'offline', and offers Try again", () => {
    for (const what of ["request", "requests", "explore", "profile", "fare"] as const) {
      const copy = readFailureCopy("UNREACHABLE", what);
      expect(copy).toEqual({ title: "We can’t reach the club right now.", body: "Try again in a moment." });
      expect(`${copy.title} ${copy.body}`.toLowerCase()).not.toContain("offline");
    }
    expect(UNREACHABLE_MESSAGE).toBe("We can’t reach the club right now. Try again in a moment.");
  });

  test("a request that could not reach the club is kept on the phone, as offline (its Idempotency-Key guards a send that did arrive)", () => {
    expect(submitFailureKind("UNREACHABLE")).toBe("queued");
  });

  test("over a list on screen, an unreachable club never says 'offline'", () => {
    expect(refreshFailedLine("UNREACHABLE")).toBe("We couldn’t refresh your requests just now.");
    expect(refreshFailedLine("UNREACHABLE", false)).toBe("We couldn’t load your other requests just now.");
  });
});

test("a password change made with the other sessions still alive is a notice; any other failure is not (ADR-IMPL-047)", () => {
  const made = {
    error: { code: "INTERNAL", message: "Your new password is set, but…", context: { passwordChanged: true } },
  };
  expect(passwordChangedNotice(made)).toBe("Your new password is set, but…");
  expect(passwordChangedNotice({ error: { code: "INTERNAL", context: { passwordChanged: true } } })).toBe(
    "Your new password is set, but your other devices are still signed in.",
  );
  expect(passwordChangedNotice({ error: { code: "INTERNAL", message: "Something didn't go as planned." } })).toBeNull();
  expect(passwordChangedNotice({ error: { code: "VALIDATION", context: { passwordChanged: "yes" } } })).toBeNull();
  expect(passwordChangedNotice(null)).toBeNull();
});
