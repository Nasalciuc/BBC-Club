import { describe, expect, it } from "bun:test";
import { RESET_DONE_SIGN_IN } from "./flows-logic";
import {
  nextAfterResetFailure,
  noticeForVerify,
  OTP_EXPIRED_UNSENT,
  RESET_DONE_NOTICE,
  signInNotice,
} from "./reset-flow-logic";

describe("the reset is done but the sign-in after it is not", () => {
  it("goes to Sign in, with a notice that the new password is set", () => {
    expect(nextAfterResetFailure(RESET_DONE_SIGN_IN)).toBe("signIn");
    expect(signInNotice("reset")).toBe(RESET_DONE_NOTICE);
    expect(RESET_DONE_NOTICE).toBe("Your new password is set. Sign in with it in a few minutes.");
  });

  it("Sign in shows no notice otherwise (a param is never trusted for words)", () => {
    expect(signInNotice(undefined)).toBeNull();
    expect(signInNotice("anything")).toBeNull();
  });
});

describe("nextAfterResetFailure — where a failed reset leaves the member", () => {
  it("a password the server refused stays on the screen, with the code kept for the next Continue", () => {
    for (const code of ["PASSWORD_COMPROMISED", "PASSWORD_TOO_WEAK", "PASSWORD_TOO_SHORT"]) {
      expect(nextAfterResetFailure(code)).toBe("stay");
    }
  });

  it("no connection stays too: nothing reached the server, the code still works", () => {
    expect(nextAfterResetFailure("OFFLINE")).toBe("stay");
    expect(nextAfterResetFailure("TIMEOUT")).toBe("stay");
  });

  it("a code that no longer works goes back to Verify, where the boxes and Resend are", () => {
    for (const code of ["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"]) {
      expect(nextAfterResetFailure(code)).toBe("verify");
    }
  });

  it("an expired code is replaced by set-password on the Continue; Verify is told whether the new one went", () => {
    expect(noticeForVerify("OTP_EXPIRED", true)).toBe("OTP_EXPIRED");
    expect(noticeForVerify("OTP_EXPIRED", false)).toBe(OTP_EXPIRED_UNSENT);
    // Nothing is sent for the others: their notice is the code itself.
    expect(noticeForVerify("INVALID_OTP", false)).toBe("INVALID_OTP");
    expect(noticeForVerify("TOO_MANY_ATTEMPTS", false)).toBe("TOO_MANY_ATTEMPTS");
  });

  it("anything else stays with its message — never a silent trip to Sign in", () => {
    expect(nextAfterResetFailure("RATE_LIMITED")).toBe("stay");
    expect(nextAfterResetFailure(undefined)).toBe("stay");
  });
});
