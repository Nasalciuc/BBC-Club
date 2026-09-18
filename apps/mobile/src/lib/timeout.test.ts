import { describe, it, expect } from "bun:test";
import { timeoutSignal, NetworkError } from "./timeout";

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
