import { describe, expect, it } from "bun:test";
import { badgeOf, statusCopy } from "./status-copy";

describe("status-copy — the words of a request's state (component sheet 41)", () => {
  it("names the five states in sentence case", () => {
    expect(statusCopy("received")).toBe("Received");
    expect(statusCopy("quote_ready")).toBe("Quote ready");
    expect(statusCopy("booked")).toBe("Booked");
    expect(statusCopy("closed")).toBe("Closed");
    expect(statusCopy("not_sent")).toBe("Not sent");
  });

  it("reads the API's quoted as Quote ready", () => {
    expect(badgeOf("quoted")).toEqual({ badge: "quote_ready", known: true });
  });

  it("reads anything unknown as Received, and says it did not know it", () => {
    expect(badgeOf("escalated")).toEqual({ badge: "received", known: false });
    expect(statusCopy("")).toBe("Received");
  });

  it("never takes an inherited name for a state", () => {
    for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(badgeOf(name)).toEqual({ badge: "received", known: false });
      expect(statusCopy(name)).toBe("Received");
    }
  });
});
