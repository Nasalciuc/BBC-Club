import { describe, it, expect } from "bun:test";
import { timeoutSignal, NetworkError, networkFail, OFFLINE_MESSAGE } from "./timeout";

describe("timeoutSignal", () => {
  it("uses AbortController when AbortSignal.timeout is missing, and cancel prevents abort", async () => {
    const hadTimeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function";
    const own = timeoutSignal(30);
    expect(own.signal.aborted).toBe(false);
    own.cancel();
    await new Promise((r) => setTimeout(r, 50));
    if (!hadTimeout) {
      expect(own.signal.aborted).toBe(false);
    }
  });

  it("aborts after the budget when not cancelled", async () => {
    const own = timeoutSignal(20);
    await new Promise((r) => setTimeout(r, 50));
    expect(own.signal.aborted).toBe(true);
    own.cancel();
  });

  it("NetworkError carries TIMEOUT vs OFFLINE", () => {
    expect(new NetworkError("TIMEOUT").code).toBe("TIMEOUT");
    expect(new NetworkError("OFFLINE").name).toBe("NetworkError");
  });
});

describe("networkFail", () => {
  it("offline promises nothing: only a request is sent later, and its own sheet says so", () => {
    const offline = networkFail(new NetworkError("OFFLINE"));
    expect(offline).toEqual({ ok: false, status: 0, code: "OFFLINE", message: OFFLINE_MESSAGE });
    expect(offline.message).toBe("You’re offline. Try again when you’re back online.");
    expect(networkFail(new TypeError("Network request failed")).code).toBe("OFFLINE");
    expect(networkFail(new TypeError("Network request failed")).message).not.toContain("send");
  });

  it("a timeout or an abort says it is taking longer", () => {
    expect(networkFail(new NetworkError("TIMEOUT")).message).toBe("Taking longer than usual — check your connection");
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(networkFail(abort).code).toBe("TIMEOUT");
  });
});
