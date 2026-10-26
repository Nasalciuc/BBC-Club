import type { EmailFacade, OtpPurpose } from "@bbc/email";
import { rememberDevOtp } from "@bbc/email";

/** Captures OTPs instead of sending. Tests read the code the way a member would from their inbox. */
export function capturingEmail(): EmailFacade & {
  lastOtp(to: string): string;
  sent: { to: string; otp: string; purpose: OtpPurpose }[];
  /** The next `times` sends throw `error` (default: a Postmark 503), as the Postmark sender does. */
  failNext(times?: number, error?: Error): void;
} {
  const sent: { to: string; otp: string; purpose: OtpPurpose }[] = [];
  let failures = 0;
  let failure: Error | undefined;
  return {
    sent,
    async sendOtp(input) {
      if (failures > 0) {
        failures--;
        throw failure ?? new Error("Postmark 503: simulated outage");
      }
      sent.push(input);
      rememberDevOtp(input.to, input.otp);
    },
    async sendOperatorRequest() {},
    lastOtp(to) {
      const m = [...sent].reverse().find((s) => s.to.toLowerCase() === to.toLowerCase() || s.to === to);
      if (!m) throw new Error(`no OTP captured for ${to}`);
      return m.otp;
    },
    failNext(times = 1, error?: Error) {
      failures = times;
      failure = error;
    },
  };
}
