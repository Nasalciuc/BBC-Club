import { describe, expect, it } from "bun:test";
import { authMessage } from "@bbc/shared/auth-messages";
import { afterResetSignIn, fail, RESET_DONE_SIGN_IN } from "./flows-logic";

describe("afterResetSignIn — the reset succeeded; the sign-in with the new password may not", () => {
  it("signed in: on to the gate", () => {
    expect(afterResetSignIn(null)).toEqual({ ok: true });
  });

  it("5 wrong sign-ins before the reset: /sign-in/email answers 429 — the password is set, Sign in later", () => {
    const result = afterResetSignIn({ status: 429 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe(RESET_DONE_SIGN_IN);
  });

  it("any other refusal, or no connection, is the same: the spent code is never offered again", () => {
    for (const err of [{ status: 500 }, { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }, "network" as const]) {
      const result = afterResetSignIn(err);
      expect(!result.ok && result.code).toBe(RESET_DONE_SIGN_IN);
    }
  });
});

describe("fail — a Better Auth error in the club's voice", () => {
  it("a code tried too many times is its own answer, not a rate limit (the server deleted it: waiting does not help)", () => {
    const result = fail({ code: "TOO_MANY_ATTEMPTS", status: 403 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("429, or a code that names a limit, is the rate-limit copy", () => {
    for (const err of [{ status: 429 }, { code: "TOO_MANY_REQUESTS", status: 429 }, { code: "RATE_LIMITED" }]) {
      expect(fail(err)).toEqual({ ok: false, code: "RATE_LIMITED", message: authMessage("RATE_LIMITED") });
    }
  });

  it("any other code keeps its own words", () => {
    expect(fail({ code: "INVALID_OTP", status: 400 })).toEqual({
      ok: false,
      code: "INVALID_OTP",
      message: authMessage("INVALID_OTP"),
    });
  });
});
