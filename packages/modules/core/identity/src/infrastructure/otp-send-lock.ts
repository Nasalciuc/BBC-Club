import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";

/** The routes that mail a code, under the handler's mount (/api/auth), and the code type each one sends. */
const SEND_PATHS: Record<string, "from-body" | "forget-password"> = {
  "/api/auth/email-otp/send-verification-otp": "from-body",
  "/api/auth/email-otp/request-password-reset": "forget-password",
  "/api/auth/forget-password/email-otp": "forget-password",
};

export type OtpSendTarget = { type: string; email: string };

/** The code a request asks to mail and where to, read from a clone of its JSON body; null for anything else (another
 *  route, another method, a body that does not parse) — those go to Better Auth untouched. */
export async function otpSendTarget(req: Request): Promise<OtpSendTarget | null> {
  if (req.method !== "POST") return null;
  const kind = SEND_PATHS[new URL(req.url).pathname.replace(/\/+$/, "")];
  if (!kind) return null;
  const body: unknown = await req
    .clone()
    .json()
    .catch(() => null);
  if (!body || typeof body !== "object") return null;
  const { email, type } = body as { email?: unknown; type?: unknown };
  if (typeof email !== "string" || email.trim() === "") return null;
  const codeType = kind === "forget-password" ? kind : typeof type === "string" ? type : null;
  if (!codeType) return null;
  return { type: codeType, email: email.trim().toLowerCase() };
}

/** At most this many code sends hold a lock (and with it one pooled connection, idle in its transaction) at once in a
 *  process; the rest wait here without a connection. The pool (10 in production) always keeps connections for the
 *  sends' own queries and for every other route. */
const MAX_LOCKED_SENDS = 3;

/**
 * Serializes code sends per address and type, across processes. Two requests for one address at the same moment used to
 * each find no code to reuse, store one each and mail both, and only the last one stored worked. Under the lock the
 * second request finds the first one's code (resendStrategy "reuse"), and the cooldown claim (same code) mails nothing.
 * The lock is a transaction-scoped advisory lock: it ends with the request (a mail takes at most Postmark's 4 s;
 * Postgres ends a session idle in a transaction after 60 s) and works behind PgBouncer's transaction pooling.
 */
export function otpSendLock(db: Executor) {
  const slots = semaphore(MAX_LOCKED_SENDS);
  return function withOtpSendLock<T>(target: OtpSendTarget, fn: () => Promise<T>): Promise<T> {
    const key = `otp:${target.type}:${target.email}`;
    return slots(() =>
      db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
        return fn();
      }),
    );
  };
}

function semaphore(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve)); // the slot is handed over, `active` unchanged
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
