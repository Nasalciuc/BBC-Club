import type { ServerEnv } from "@bbc/shared/env";
import type { OtpSendFailure } from "./otp-send-outcome";

type WarnLog = { warn: (o: object, m?: string) => void };

/** One line to the ops channel (OPS_WEBHOOK, Slack-compatible, as the worker's DB alerts and the requests module post).
 *  Unset: logged instead. A failed post throws; the caller logs it and carries on. */
export function opsWebhook(env: Pick<ServerEnv, "OPS_WEBHOOK">, logger: WarnLog): (text: string) => Promise<void> {
  return async (text) => {
    const hook = env.OPS_WEBHOOK;
    if (!hook) {
      logger.warn({ text }, "ops alert (OPS_WEBHOOK unset — not posted)");
      return;
    }
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[bbc identity] ${text}` }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error(`OPS_WEBHOOK ${res.status}`);
  };
}

/** Five minutes: the alert is "otp_send_failed > 0 over 5 min", per API process (counters live in each process). */
export const OTP_ALERT_WINDOW_MS = 5 * 60_000;

/**
 * Posts the first failed code mail of each window to the ops channel, with how many more failed since the last post.
 * Never the address or the code. A post that fails is logged and never fails the request.
 */
export function otpFailureAlert(opts: {
  post: (text: string) => Promise<void>;
  logger: WarnLog;
  windowMs?: number;
  now?: () => number;
}): (purpose: string, failure: OtpSendFailure) => Promise<void> {
  const windowMs = opts.windowMs ?? OTP_ALERT_WINDOW_MS;
  const now = opts.now ?? Date.now;
  let lastPostedAt = Number.NEGATIVE_INFINITY;
  let since = 0;
  return async (purpose, failure) => {
    const at = now();
    if (at - lastPostedAt < windowMs) {
      since++;
      return;
    }
    lastPostedAt = at;
    const more = since > 0 ? ` (${since} more since the last alert)` : "";
    since = 0;
    const facts = [
      `purpose=${purpose}`,
      `reason=${failure.reason}`,
      failure.status !== undefined ? `status=${failure.status}` : "",
      failure.postmarkErrorCode !== undefined ? `postmarkErrorCode=${failure.postmarkErrorCode}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    try {
      await opts.post(`otp send failed: ${facts}${more}. RUNBOOK: "Postmark down / OTP not arriving".`);
    } catch (err) {
      opts.logger.warn({ error: err instanceof Error ? err.message : typeof err }, "ops alert not posted");
    }
  };
}
