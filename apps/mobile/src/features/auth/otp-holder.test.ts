import { beforeEach, describe, expect, it } from "bun:test";
import { clearPendingOtp, peekPendingOtp, setPendingOtp, takePendingOtp } from "./otp-holder";

beforeEach(() => clearPendingOtp());

describe("otp-holder — the reset code in memory", () => {
  it("peek reads the code and keeps it: a failed Continue on set-password can try again", () => {
    setPendingOtp("123456");
    expect(peekPendingOtp()).toBe("123456");
    expect(peekPendingOtp()).toBe("123456");
  });

  it("take reads it once and clears it", () => {
    setPendingOtp("123456");
    expect(takePendingOtp()).toBe("123456");
    expect(peekPendingOtp()).toBeNull();
  });

  it("clear forgets it", () => {
    setPendingOtp("123456");
    clearPendingOtp();
    expect(peekPendingOtp()).toBeNull();
  });
});
