import type { EmailSender, OtpPurpose } from "@bbc/identity/ports/email";

const SUBJECTS: Record<OtpPurpose, string> = {
  "email-verification": "Your BuyBusinessClass Club code",
  "forget-password": "Reset your BuyBusinessClass Club password",
  "sign-in": "Your BuyBusinessClass Club sign-in code",
};

export function postmarkSender(opts: { token: string; from: string; fetchImpl?: typeof fetch }): EmailSender {
  const f = opts.fetchImpl ?? fetch;
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
          TextBody: `Your code is ${otp}. It expires in 10 minutes.\n\nIf you didn't request it, you can ignore this email.`,
          MessageStream: "outbound",
          Tag: purpose,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Postmark ${res.status}: ${body.slice(0, 200)}`); // ← propagate; never swallow
      }
    },
  };
}

/** Development: log instead of send. Never used when NODE_ENV=production (env.ts enforces the token). */
export function consoleSender(log: (m: string) => void = console.log): EmailSender {
  return {
    async sendOtp({ to, otp, purpose }) {
      log(`[dev-email] ${purpose} → ${to}: ${otp}`);
    },
  };
}
