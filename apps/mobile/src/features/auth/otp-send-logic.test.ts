import { describe, it, expect } from "bun:test";
import { CONSTANT_OTP_SENT, CONSTANT_RESET_SENT } from "@bbc/shared/auth-messages";
import { NetworkError, OFFLINE_MESSAGE } from "../../lib/timeout";
import { otpSendResult, type OtpSendAnswer } from "./otp-send-logic";

const answered = (error: OtpSendAnswer["error"]) => async (): Promise<OtpSendAnswer> => ({ error });
const threw = (e: unknown) => async (): Promise<OtpSendAnswer> => {
  throw e;
};

describe("otpSendResult — the first code send stays constant while the server answered", () => {
  it("a mailed code reads as sent, with each screen's own words", async () => {
    expect(await otpSendResult(answered(null), CONSTANT_OTP_SENT)).toEqual({ ok: true, message: CONSTANT_OTP_SENT });
    expect(await otpSendResult(answered(null), CONSTANT_RESET_SENT)).toEqual({
      ok: true,
      message: CONSTANT_RESET_SENT,
    });
  });

  it("a server refusal or rate limit reads exactly the same (no oracle, no leaked code)", async () => {
    for (const status of [400, 429, 500]) {
      expect(await otpSendResult(answered({ status }), CONSTANT_OTP_SENT)).toEqual({
        ok: true,
        message: CONSTANT_OTP_SENT,
      });
      expect(await otpSendResult(answered({ status }), CONSTANT_RESET_SENT)).toEqual({
        ok: true,
        message: CONSTANT_RESET_SENT,
      });
    }
  });
});

describe("otpSendResult — nothing answered: the member hears about the connection", () => {
  it("a thrown network failure is offline (the client throws when no host answers)", async () => {
    expect(await otpSendResult(threw(new TypeError("Network request failed")), CONSTANT_OTP_SENT)).toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
      code: "OFFLINE",
    });
  });

  it("an error with no HTTP status behind it is offline too (status 0: no response)", async () => {
    expect(await otpSendResult(answered({ status: 0 }), CONSTANT_RESET_SENT)).toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
      code: "OFFLINE",
    });
    expect(await otpSendResult(answered({}), CONSTANT_OTP_SENT)).toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
      code: "OFFLINE",
    });
  });

  it("the 10 s budget running out is a timeout, not a sent code", async () => {
    expect(await otpSendResult(threw(new NetworkError("TIMEOUT")), CONSTANT_OTP_SENT)).toEqual({
      ok: false,
      message: "Taking longer than usual — check your connection",
      code: "TIMEOUT",
    });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(await otpSendResult(threw(abort), CONSTANT_RESET_SENT)).toEqual({
      ok: false,
      message: "Taking longer than usual — check your connection",
      code: "TIMEOUT",
    });
  });
});
