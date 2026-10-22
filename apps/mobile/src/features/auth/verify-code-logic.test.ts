import { describe, expect, it } from "bun:test";
import {
  afterVerifyError,
  formatResendCountdown,
  RESEND_SECONDS,
  resendDeadline,
  secondsLeft,
  TOO_MANY_ATTEMPTS_COPY,
} from "./verify-code-logic";

describe("afterVerifyError — what Verify does with a code the server refused", () => {
  it("a code tried too many times is dead: boxes cleared, Resend open at once, words that say to ask again", () => {
    expect(afterVerifyError("TOO_MANY_ATTEMPTS")).toEqual({
      resend: false,
      resendNow: true,
      clear: true,
      message: TOO_MANY_ATTEMPTS_COPY,
    });
    expect(TOO_MANY_ATTEMPTS_COPY).toBe("That code was tried too many times. Ask for a new one below.");
  });

  it("a wrong code stays to be corrected, with the server's words", () => {
    expect(afterVerifyError("INVALID_OTP")).toEqual({ resend: false, resendNow: false, clear: false, message: null });
  });
});

describe("Resend code — the server's 30 s cooldown, counted on the wall clock", () => {
  it("waits as long as the server does (identity otp-cooldown.ts OTP_COOLDOWN_SECONDS), not 15 minutes", () => {
    expect(RESEND_SECONDS).toBe(30);
  });

  it("counts from a deadline, so time spent in the Mail app counts", () => {
    const start = 1_800_000_000_000;
    const deadline = resendDeadline(start);
    expect(secondsLeft(deadline, start)).toBe(30);
    expect(secondsLeft(deadline, start + 10_000)).toBe(20);
    expect(secondsLeft(deadline, start + 29_001)).toBe(1);
    expect(secondsLeft(deadline, start + 30_000)).toBe(0);
    // Back from the Mail app minutes later: open at once, never negative.
    expect(secondsLeft(deadline, start + 5 * 60_000)).toBe(0);
  });

  it("a deadline of now opens Resend at once", () => {
    const now = 1_800_000_000_000;
    expect(secondsLeft(now, now)).toBe(0);
  });

  it("shows minutes and seconds", () => {
    expect(formatResendCountdown(30)).toBe("0:30");
    expect(formatResendCountdown(5)).toBe("0:05");
  });
});
