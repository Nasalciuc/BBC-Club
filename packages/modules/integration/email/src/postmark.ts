import type { EmailFacade, OtpPurpose } from "./api/types";

const SUBJECTS: Record<OtpPurpose, string> = {
  "email-verification": "Your BuyBusinessClass Club code",
  "forget-password": "Reset your BuyBusinessClass Club password",
  "sign-in": "Your BuyBusinessClass Club sign-in code",
  "change-email": "Confirm your new BuyBusinessClass Club email",
};

/** In-memory last OTP per email for non-production Maestro / local helpers. Never log the code. */
const lastOtpByEmail = new Map<string, string>();

export function rememberDevOtp(to: string, otp: string): void {
  lastOtpByEmail.set(to.trim().toLowerCase(), otp);
}

/** Test/dev helper: returns the last OTP for an email, or null. */
export function lastDevOtp(to: string): string | null {
  return lastOtpByEmail.get(to.trim().toLowerCase()) ?? null;
}

/** Postmark answers in well under a second. Past this the call is abandoned and fails: the OTP send releases its
 *  cooldown claim, so the member can ask again; a request to the specialists fails with this reason, under the CRM's own
 *  5 s ceiling, and its job retries it. Without it a hung connection waited for as long as the socket lived. */
export const POSTMARK_TIMEOUT_MS = 4_000;

export function postmarkSender(opts: {
  token: string;
  from: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): EmailFacade {
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? POSTMARK_TIMEOUT_MS;
  return {
    async sendOtp({ to, otp, purpose }) {
      const res = await f("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Postmark-Server-Token": opts.token,
        },
        body: JSON.stringify({
          From: opts.from,
          To: to, // ← the member's address, never a constant
          Subject: SUBJECTS[purpose],
          TextBody: `Your code is ${otp}. It expires in 15 minutes.\n\nIf you didn't request it, you can ignore this email.`,
          MessageStream: "outbound",
          Tag: purpose,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Postmark ${res.status}: ${body.slice(0, 200)}`); // ← propagate; never swallow
      }
    },
    async sendOperatorRequest({ to, subject, text, replyTo }) {
      const res = await f("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Postmark-Server-Token": opts.token,
        },
        body: JSON.stringify({
          From: opts.from,
          To: to,
          Subject: subject,
          TextBody: text,
          MessageStream: "outbound",
          ...(replyTo ? { ReplyTo: replyTo } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Postmark ${res.status}: ${body.slice(0, 200)}`);
      }
    },
  };
}

/** Development: store OTP for the test helper; log purpose + recipient only (never the code). */
export function consoleSender(log: (m: string) => void = console.log): EmailFacade {
  return {
    async sendOtp({ to, otp, purpose }) {
      rememberDevOtp(to, otp);
      log(`[dev-email] ${purpose} → ${to}`);
    },
    async sendOperatorRequest({ subject }) {
      log(`[dev-email] ${subject}`);
    },
  };
}
