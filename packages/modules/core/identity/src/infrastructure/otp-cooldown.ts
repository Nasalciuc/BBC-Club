import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";

export const OTP_COOLDOWN_SECONDS = 30;

/** Atomically claims the right to send. False = a code went to this address < 30 s ago: send nothing. */
export async function claimOtpSend(db: Executor, email: string, type: string): Promise<boolean> {
  const key = createHash("sha256").update(`${type}:${email.trim().toLowerCase()}`).digest("hex");
  const rows = (await db.execute(sql`
    INSERT INTO auth.otp_cooldown (key, last_sent_at) VALUES (${key}, now())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
      WHERE auth.otp_cooldown.last_sent_at < now() - make_interval(secs => ${OTP_COOLDOWN_SECONDS})
    RETURNING 1`)) as unknown[];
  return rows.length > 0;
}
