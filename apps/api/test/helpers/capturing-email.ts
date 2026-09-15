import type { EmailSender, OtpPurpose } from "@bbc/identity/ports/email";
import { rememberDevOtp } from "@bbc/email";

/** Captures OTPs instead of sending. Tests read the code the way a member would from their inbox. */
export function capturingEmail(): EmailSender & {
  lastOtp(to: string): string;
  sent: { to: string; otp: string; purpose: OtpPurpose }[];
  failNext(times?: number): void;
} {
  const sent: { to: string; otp: string; purpose: OtpPurpose }[] = [];
  let failures = 0;
  return {
    sent,
    async sendOtp(input) {
      if (failures > 0) {
        failures--;
        throw new Error("Postmark 503: simulated outage");
      }
      sent.push(input);
      rememberDevOtp(input.to, input.otp);
    },
    lastOtp(to) {
      const m = [...sent].reverse().find((s) => s.to === to.toLowerCase() || s.to === to);
      if (!m) throw new Error(`no OTP captured for ${to}`);
      return m.otp;
    },
    failNext(times = 1) {
      failures = times;
    },
  };
}
