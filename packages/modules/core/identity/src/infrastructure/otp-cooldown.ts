import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";

export const OTP_COOLDOWN_SECONDS = 30;

export type OtpClaim = { key: string; claimedAt: string };

function cooldownKey(email: string, type: string): string {
  return createHash("sha256").update(`${type}:${email.trim().toLowerCase()}`).digest("hex");
}

function otpHash(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/**
 * Atomically claims the right to send.
 * - Same otp inside the window → null (reuse: do not re-mail).
 * - New otp (BA replacement after exhausted attempts) or window expired → claim.
 */
export async function claimOtpSend(db: Executor, email: string, type: string, otp: string): Promise<OtpClaim | null> {
  const key = cooldownKey(email, type);
  const hash = otpHash(otp);
  const rows = (await db.execute(sql`
    INSERT INTO auth.otp_cooldown (key, last_sent_at, otp_hash) VALUES (${key}, now(), ${hash})
    ON CONFLICT (key) DO UPDATE SET last_sent_at = now(), otp_hash = ${hash}
      WHERE auth.otp_cooldown.last_sent_at < now() - make_interval(secs => ${OTP_COOLDOWN_SECONDS})
         OR auth.otp_cooldown.otp_hash IS DISTINCT FROM ${hash}
    RETURNING last_sent_at`)) as { last_sent_at: Date | string }[];
  if (!rows.length) return null;
  const row = rows[0];
  if (!row) return null;
  const raw = row.last_sent_at;
  const claimedAt = raw instanceof Date ? raw.toISOString() : String(raw);
  return { key, claimedAt };
}

/**
 * Undo a claim when delivery failed, but only if no later request replaced this claim.
 * Shifts last_sent_at just outside the window so the next retry can claim again.
 */
export async function releaseOtpClaim(db: Executor, claim: OtpClaim): Promise<void> {
  await db.execute(sql`
    UPDATE auth.otp_cooldown
    SET last_sent_at = last_sent_at - make_interval(secs => ${OTP_COOLDOWN_SECONDS + 1})
    WHERE key = ${claim.key} AND last_sent_at = ${claim.claimedAt}::timestamptz`);
}
