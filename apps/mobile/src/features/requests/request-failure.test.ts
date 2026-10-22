import { describe, expect, it } from "bun:test";

import { readFailureCopy, stateCopy } from "../../lib/error-context";
import { requestFailureFrame } from "./request-failure";

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
