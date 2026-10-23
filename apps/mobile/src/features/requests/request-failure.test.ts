import { describe, expect, it } from "bun:test";

import { readFailureCopy, stateCopy } from "../../lib/error-context";
import { isRequestId, requestFailureFrame } from "./request-failure";

describe("isRequestId — only an id the server could hold is asked for", () => {
  it("a request's id (a UUID, as RequestVM reads it) is asked; anything else is no request at all", () => {
    expect(isRequestId("00000000-0000-4000-8000-0000000000a1")).toBe(true);
    // A link anyone can write (`bbcclub://requests/abc`): the server cannot read it as an id and answers 500, which
    // would offer `Try again` forever.
    expect(isRequestId("abc")).toBe(false);
    expect(isRequestId("")).toBe(false);
    expect(isRequestId("00000000-0000-4000-8000-0000000000a1/extra")).toBe(false);
  });
});

describe("requestFailureFrame — a request page that could not load (F015)", () => {
  it("a request that is gone or another member's: said so, and the way back to Requests — no Try again", () => {
    const frame = requestFailureFrame({ status: 404, code: "NOT_FOUND" });
    expect(frame).toEqual({
      kind: "notFound",
      title: "We can’t find this request.",
      body: "It may have been removed, or it belongs to another account.",
      actions: ["backToRequests"],
    });
    // Either sign is enough: the status, or the server's code.
    expect(requestFailureFrame({ status: 404 }).kind).toBe("notFound");
    expect(requestFailureFrame({ status: 400, code: "NOT_FOUND" }).kind).toBe("notFound");
  });

  it("a failure that may pass: the page's message, with Try again", () => {
    expect(requestFailureFrame({ status: 500, code: "INTERNAL" })).toEqual({
      kind: "route",
      ...stateCopy("route"),
      actions: ["retry"],
    });
    expect(requestFailureFrame({ status: 0, code: "TIMEOUT" })).toEqual({
      kind: "route",
      ...stateCopy("route"),
      actions: ["retry"],
    });
    expect(requestFailureFrame({ status: 0, code: "OFFLINE" })).toEqual({
      kind: "offline",
      ...readFailureCopy("OFFLINE", "request"),
      actions: ["retry"],
    });
    expect(requestFailureFrame({ status: 0, code: "UNREACHABLE" })).toEqual({
      kind: "unreachable",
      ...readFailureCopy("UNREACHABLE", "request"),
      actions: ["retry"],
    });
  });
});
