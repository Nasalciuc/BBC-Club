import { describe, it, expect } from "bun:test";
import { otpSendTarget } from "../src/infrastructure/otp-send-lock";

const post = (path: string, body: string) =>
  new Request(`http://localhost:8000/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

describe("which requests take the per-address send lock", () => {
  it("a code send names its type and the address as Better Auth stores it (trimmed, lower case)", async () => {
    expect(
      await otpSendTarget(post("/email-otp/send-verification-otp", '{"email":" Alex@Test.dev ","type":"sign-in"}')),
    ).toEqual({ type: "sign-in", email: "alex@test.dev" });
    expect(await otpSendTarget(post("/email-otp/request-password-reset", '{"email":"a@b.dev"}'))).toEqual({
      type: "forget-password",
      email: "a@b.dev",
    });
    expect(await otpSendTarget(post("/forget-password/email-otp", '{"email":"a@b.dev"}'))).toEqual({
      type: "forget-password",
      email: "a@b.dev",
    });
  });

  it("everything else passes straight through, and the body is still there for Better Auth", async () => {
    expect(await otpSendTarget(post("/sign-in/email-otp", '{"email":"a@b.dev","otp":"123456"}'))).toBeNull();
    expect(await otpSendTarget(post("/email-otp/send-verification-otp", "not json"))).toBeNull();
    expect(await otpSendTarget(post("/email-otp/send-verification-otp", '{"type":"sign-in"}'))).toBeNull();
    expect(
      await otpSendTarget(new Request("http://localhost:8000/api/auth/email-otp/send-verification-otp")),
    ).toBeNull();
    const req = post("/email-otp/send-verification-otp", '{"email":"a@b.dev","type":"sign-in"}');
    await otpSendTarget(req);
    expect(await req.json()).toEqual({ email: "a@b.dev", type: "sign-in" });
  });
});
