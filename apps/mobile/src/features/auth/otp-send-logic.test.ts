import { describe, it, expect } from "bun:test";
import { authMessage, CONSTANT_OTP_SENT, CONSTANT_RESET_SENT } from "@bbc/shared/auth-messages";
import { NetworkError, OFFLINE_MESSAGE } from "../../lib/timeout";
import { JOIN_SEND_FAILED, JOIN_UNDELIVERABLE, otpSendResult, type OtpSendAnswer } from "./otp-send-logic";

const answered = (error: OtpSendAnswer["error"]) => async (): Promise<OtpSendAnswer> => ({ error });
const threw = (e: unknown) => async (): Promise<OtpSendAnswer> => {
  throw e;
};

describe("otpSendResult — a mailed code reads as sent", () => {
  it("with each screen's own words", async () => {
    expect(await otpSendResult(answered(null), CONSTANT_OTP_SENT, "join")).toEqual({
      ok: true,
      message: CONSTANT_OTP_SENT,
    });
    expect(await otpSendResult(answered(null), CONSTANT_RESET_SENT, "reset")).toEqual({
      ok: true,
      message: CONSTANT_RESET_SENT,
    });
  });
});

describe("otpSendResult — Join: no oracle to keep (Path A mails any address), so a code that did not leave says so", () => {
  it("the per-address limit is the rate-limit copy, and the screen stays", async () => {
    expect(await otpSendResult(answered({ status: 429 }), CONSTANT_OTP_SENT, "join")).toEqual({
      ok: false,
      message: authMessage("RATE_LIMITED"),
      code: "RATE_LIMITED",
    });
  });

  it("an address the mail service refuses says to check it", async () => {
    for (const error of [
      { status: 503 },
      { status: 503, code: "EMAIL_UNDELIVERABLE" },
      { status: 502, code: "EMAIL_UNDELIVERABLE" },
    ]) {
      expect(await otpSendResult(answered(error), CONSTANT_OTP_SENT, "join")).toEqual({
        ok: false,
        message: JOIN_UNDELIVERABLE,
        code: "EMAIL_UNDELIVERABLE",
      });
    }
  });

  it("another server failure says no code left just now", async () => {
    expect(await otpSendResult(answered({ status: 500 }), CONSTANT_OTP_SENT, "join")).toEqual({
      ok: false,
      message: JOIN_SEND_FAILED,
      code: "SEND_FAILED",
    });
  });

  it("a refusal says what the server named", async () => {
    expect(await otpSendResult(answered({ status: 400, code: "INVALID_EMAIL" }), CONSTANT_OTP_SENT, "join")).toEqual({
      ok: false,
      message: authMessage("INVALID_EMAIL"),
      code: "INVALID_EMAIL",
    });
  });
});

describe("otpSendResult — Forgot password: constant while the server answered (no oracle), but the IP limit shows", () => {
  it("a refusal or a server failure reads exactly as sent", async () => {
    for (const error of [{ status: 400 }, { status: 500 }, { status: 503, code: "EMAIL_UNDELIVERABLE" }]) {
      expect(await otpSendResult(answered(error), CONSTANT_RESET_SENT, "reset")).toEqual({
        ok: true,
        message: CONSTANT_RESET_SENT,
      });
    }
  });

  it("the limit is per address of the phone, not per email: 429 says to slow down", async () => {
    expect(await otpSendResult(answered({ status: 429 }), CONSTANT_RESET_SENT, "reset")).toEqual({
      ok: false,
      message: authMessage("RATE_LIMITED"),
      code: "RATE_LIMITED",
    });
  });
});

describe("otpSendResult — nothing answered: the member hears about the connection", () => {
  it("a thrown network failure is offline (the client throws when no host answers)", async () => {
    expect(await otpSendResult(threw(new TypeError("Network request failed")), CONSTANT_OTP_SENT, "join")).toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
      code: "OFFLINE",
    });
  });

  it("an error with no HTTP status behind it is offline too (status 0: no response)", async () => {
    expect(await otpSendResult(answered({ status: 0 }), CONSTANT_RESET_SENT, "reset")).toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
      code: "OFFLINE",
    });
    expect(await otpSendResult(answered({}), CONSTANT_OTP_SENT, "join")).toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
      code: "OFFLINE",
    });
  });

  it("the 10 s budget running out is a timeout, not a sent code", async () => {
    expect(await otpSendResult(threw(new NetworkError("TIMEOUT")), CONSTANT_OTP_SENT, "join")).toEqual({
      ok: false,
      message: "Taking longer than usual — check your connection",
      code: "TIMEOUT",
    });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(await otpSendResult(threw(abort), CONSTANT_RESET_SENT, "reset")).toEqual({
      ok: false,
      message: "Taking longer than usual — check your connection",
      code: "TIMEOUT",
    });
  });
});
