/** Better Auth emailOTP `type` values (plugin may add more over time). */
export type OtpPurpose = "email-verification" | "forget-password" | "sign-in" | "change-email";

export interface EmailSender {
  /** MUST resolve only after the provider accepted the message; MUST throw on any failure.
   *  Callers await it. The recipient is always the member's real address. */
  sendOtp(input: { to: string; otp: string; purpose: OtpPurpose }): Promise<void>;
}
