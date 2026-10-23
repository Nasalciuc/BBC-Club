import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";

/** The routes that mail a code, under the handler's mount (/api/auth), and the code type each one sends. */
const SEND_PATHS: Record<string, "from-body" | "forget-password"> = {
  "/api/auth/email-otp/send-verification-otp": "from-body",
  "/api/auth/email-otp/request-password-reset": "forget-password",
  "/api/auth/forget-password/email-otp": "forget-password",
};

export type OtpSendTarget = { type: string; email: string };

const sendKind = (req: Request) =>
  req.method === "POST" ? SEND_PATHS[new URL(req.url).pathname.replace(/\/+$/, "")] : undefined;

/** A POST to one of the routes that mail a code, whatever its body. */
export function isOtpSendRequest(req: Request): boolean {
  return sendKind(req) !== undefined;
}

/** Better Auth's router (better-call `getBody`) reads JSON when Content-Type matches this, and form bodies
 *  (`application/x-www-form-urlencoded`, `multipart/form-data`) as FormData. The club reads the same media types so a
 *  form reset stays under the per-address lock; a mixed Content-Type that Better Auth would still parse as one kind is
 *  left unread (null), so the body cannot say one thing to the club and another to Better Auth. */
const JSON_CONTENT_TYPE = /^application\/([a-z0-9.+-]*\+)?json/i;
/** A single form media type (optional parameters after `;`). A mixed Content-Type that also claims JSON is left
 *  unread — Better Auth may treat it as a form while a naive reader would treat it as JSON. */
const FORM_CONTENT_TYPE = /^(application\/x-www-form-urlencoded|multipart\/form-data)(\s*;.*)?$/i;

async function readSendBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (JSON_CONTENT_TYPE.test(contentType)) {
    const body: unknown = await req
      .clone()
      .json()
      .catch(() => null);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  }
  if (FORM_CONTENT_TYPE.test(contentType)) {
    const form = await req
      .clone()
      .formData()
      .catch(() => null);
    if (!form) return null;
    const values: Record<string, unknown> = {};
    form.forEach((value, key) => {
      values[key] = value;
    });
    return values;
  }
  return null;
}

/** The code a request asks to mail and where to, read from a clone of its body; null for anything else (another
 *  route, another method, a body that is not JSON/form to Better Auth or does not parse) — those go to Better Auth
 *  untouched (the answer floor still holds). */
export async function otpSendTarget(req: Request): Promise<OtpSendTarget | null> {
  const kind = sendKind(req);
  if (!kind) return null;
  const body = await readSendBody(req);
  if (!body) return null;
  const email = body.email;
  const type = body.type;
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
  const inLine = queuePerKey();
  return function withOtpSendLock<T>(target: OtpSendTarget, fn: () => Promise<T>): Promise<T> {
    const key = `otp:${target.type}:${target.email}`;
    // Requests for one address wait for each other here first, in memory: only the first of them holds a slot at a time.
    // Otherwise a burst for one address (during a Postmark outage, each send takes its 4 s) would fill every slot with
    // requests waiting on that address's lock, and no other address in the process could get a code meanwhile.
    return inLine(key, () =>
      slots(() =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
          return fn();
        }),
      ),
    );
  };
}

/** Runs the calls for one key one after the other, in arrival order; calls for different keys do not wait. A call that
 *  fails does not stop the next one. A key is forgotten once its last call has settled. */
function queuePerKey() {
  const tails = new Map<string, Promise<void>>();
  return function inLine<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const result = (tails.get(key) ?? Promise.resolve()).then(fn);
    const tail: Promise<void> = result.then(
      () => forget(),
      () => forget(),
    );
    function forget() {
      if (tails.get(key) === tail) tails.delete(key);
    }
    tails.set(key, tail);
    return result;
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
