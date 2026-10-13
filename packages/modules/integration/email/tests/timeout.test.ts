import { describe, expect, it } from "bun:test";
import { postmarkSender } from "../src/postmark";

/** A Postmark that never answers: the request ends only when its signal aborts. */
function hanging(seen: AbortSignal[]): typeof fetch {
  return ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      if (!signal) return; // no signal: hangs for good, and the test times out
      seen.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason));
    })) as typeof fetch;
}

describe("Postmark timeout", () => {
  it("abandons a code that Postmark never answers, and says so", async () => {
    const seen: AbortSignal[] = [];
    const sender = postmarkSender({
      token: "t",
      from: "club@buybusinessclass.com",
      fetchImpl: hanging(seen),
      timeoutMs: 50,
    });
    const started = Date.now();
    await expect(sender.sendOtp({ to: "alex@test.dev", otp: "123456", purpose: "sign-in" })).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(seen).toHaveLength(1);
  });

  it("abandons a request to the specialists the same way", async () => {
    const seen: AbortSignal[] = [];
    const sender = postmarkSender({
      token: "t",
      from: "club@buybusinessclass.com",
      fetchImpl: hanging(seen),
      timeoutMs: 50,
    });
    await expect(
      sender.sendOperatorRequest({
        to: "ops@buybusinessclass.com",
        subject: "Request R-1",
        text: "New fare request R-1",
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(seen).toHaveLength(1);
  });
});
