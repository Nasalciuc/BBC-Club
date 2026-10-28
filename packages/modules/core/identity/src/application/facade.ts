import type { MiddlewareHandler } from "hono";
import { desc, eq, lt } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import type { Auth } from "../infrastructure/auth";
import { user } from "../infrastructure/schema";
import { isOtpSendRequest, otpSendLock, otpSendTarget } from "../infrastructure/otp-send-lock";
import { POSTMARK_TIMEOUT_MS } from "@bbc/email";
import type { AuthVars, IdentityFacade, Member, SessionInfo } from "../api";
import { carriesBearer, keyedToken, sessionKey, type SessionCache } from "./session-cache";

export type { Member, AuthVars, SessionInfo, IdentityFacade };

/** Methods that change nothing: they may answer from the cookie cache. Every other method reads the session fresh. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type IdentityFacadeOptions = {
  /** The floor under a reset or verification code's answer. Default: Postmark's timeout. Tests make it short. */
  otpAnswerFloorMs?: number;
  /** ADR-IMPL-076: the sessions this process keeps (module.ts makes one); without it every read asks Better Auth. */
  sessions?: SessionCache;
};

/** Implementation — imported by module.ts, not by other packages via api/index.ts. */
export function createIdentityFacade(
  auth: Auth,
  db: Executor,
  options: IdentityFacadeOptions = {},
): Omit<IdentityFacade, "auth"> {
  const sessions = options.sessions;
  /** The one cookie Better Auth reads a session from (`authCookies.sessionToken`): what this process keeps is keyed
   *  on it and on no other cookie of the same name (ADR-IMPL-076). */
  let tokenCookie: string | undefined;
  async function sessionCookie(): Promise<string> {
    tokenCookie ??= (await auth.$context).authCookies.sessionToken.name;
    return tokenCookie;
  }

  /** `fresh` reads the session row and its user from the database instead of the signed cookie cache
   *  (SESSION_COOKIE_CACHE_SECONDS): a deleted member or an ended session is anonymous at once, not a minute later.
   *  A read answers from what this process keeps for the token (ADR-IMPL-076); on a miss it reads fresh, so nothing is
   *  kept that the database did not say within the minute. A fresh read puts its answer back. */
  async function getSession(headers: Headers, opts: { fresh?: boolean } = {}): Promise<SessionInfo | null> {
    // A sign-out, a password change or a deletion that forgets this token or its member from here on, while the read
    // waits on the database: what the read found is not put back (ADR-IMPL-076). Taken before anything is awaited.
    const since = sessions?.begin();
    const bearer = sessions !== undefined && carriesBearer(headers);
    const cookie = sessions && !bearer ? await sessionCookie() : null;
    const key = cookie ? sessionKey(headers, cookie) : null;
    if (key && sessions && !opts.fresh) {
      const kept = sessions.get(key);
      if (kept) return kept;
    }
    // A miss reads fresh, and so does a request with a bearer token, which the cache never answers.
    const fresh = opts.fresh === true || key !== null || bearer;
    const info = await readSession(headers, fresh);
    if (key && cookie && sessions) {
      // Kept only when Better Auth verified the very token the key was taken from: otherwise answered, never kept.
      if (info && info.token === keyedToken(headers, cookie)) sessions.put(key, info.session, info.expiresAt, since);
      else if (!info) sessions.forget(key);
    }
    return info?.session ?? null;
  }

  async function readSession(
    headers: Headers,
    fresh: boolean,
  ): Promise<{ session: SessionInfo; expiresAt: Date | null; token: string } | null> {
    let s = await auth.api.getSession({ headers, query: fresh ? { disableCookieCache: true } : undefined });
    if (s?.user && !s.user.emailVerified && !fresh) {
      // A code sign-in verifies an account registered unverified earlier, but Better Auth writes the user as it was
      // (emailVerified: false) into the cookie cache: read once more past the cache before calling the member unverified.
      s = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
    }
    if (!s?.user) return null;
    if (!s.user.emailVerified) return null;
    const expiresAt = s.session.expiresAt ? new Date(s.session.expiresAt) : null;
    return {
      session: {
        member: {
          id: s.user.id,
          email: s.user.email,
          emailVerified: true,
          role: (s.user as { role?: string }).role ?? "member",
        },
        sessionId: s.session.id,
      },
      expiresAt,
      token: s.session.token,
    };
  }

  const requireMember: MiddlewareHandler<AuthVars> = async (c, next) => {
    const s = await getSession(c.req.raw.headers, { fresh: !SAFE_METHODS.has(c.req.method) });
    if (!s) return c.json({ error: { code: "UNAUTHORIZED", message: "Please sign in." } }, 401);
    c.set("member", s.member);
    c.set("sessionId", s.sessionId);
    await next();
  };

  const requireRole =
    (...allowed: string[]): MiddlewareHandler<AuthVars> =>
    async (c, next) => {
      const m = c.get("member");
      if (!m || !allowed.includes(m.role))
        return c.json({ error: { code: "FORBIDDEN", message: "Not allowed." } }, 403);
      await next();
    };

  /** The same rule as the app's route: the password is asked for every time (club-guards runs for in-process calls). */
  async function deleteAccount(headers: Headers, password: string): Promise<void> {
    const { key, member } = await sessionOf(headers);
    await auth.api.deleteUser({ headers, body: { password } });
    if (key) sessions?.forget(key);
    if (member) sessions?.forgetMember(member);
  }

  /** The key of the token a write to Better Auth acts on and the member this process knows behind it. A bearer token
   *  stands for the cookie when there is one (`bearer()`), so then no key: the member a fresh read finds. */
  async function sessionOf(headers: Headers): Promise<{ key: string | null; member: string | null }> {
    if (!sessions) return { key: null, member: null };
    if (carriesBearer(headers))
      return { key: null, member: (await readSession(headers, true))?.session.member.id ?? null };
    const key = sessionKey(headers, await sessionCookie());
    return { key, member: key ? sessions.memberOf(key) : null };
  }

  /** ADR-IMPL-076: a write to /api/auth (a sign-out, a revoke, a change) forgets what this process keeps for the token's
   *  member, whatever it answered: the next read asks the database. */
  async function forgettingSessions(req: Request, run: () => Promise<Response>): Promise<Response> {
    if (!sessions || SAFE_METHODS.has(req.method)) return run();
    const { key, member } = await sessionOf(req.headers);
    try {
      return await run();
    } finally {
      if (key) sessions.forget(key);
      if (member) sessions.forgetMember(member);
    }
  }

  async function listUsersCreatedBefore(
    before: Date,
    limit = 5000,
  ): Promise<{ id: string; email: string; createdAt: Date }[]> {
    const rows: { id: string; email: string; createdAt: Date }[] = await db
      .select({ id: user.id, email: user.email, createdAt: user.createdAt })
      .from(user)
      .where(lt(user.createdAt, before))
      .orderBy(desc(user.createdAt))
      .limit(limit);
    return rows;
  }

  /** Read from auth.user, never from the session: a session of a deleted account stays in the cookie cache for up to
   *  SESSION_COOKIE_CACHE_SECONDS. The email is normalised as the member.registered hook (auth.ts) normalises it. */
  async function registeredEmail(memberId: string): Promise<string | null> {
    const [row]: { email: string }[] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, memberId))
      .limit(1);
    return row ? row.email.trim().toLowerCase() : null;
  }

  const withOtpSendLock = otpSendLock(db);
  // Floor covers the send timeout, the ops webhook's own timeout (ops-alert.ts) and a margin for the claim/release
  // queries: a member send that fails can outlast Postmark's 4 s, and an unknown address answers at the floor — a
  // shorter floor would tell who has an account.
  const answerFloorMs = options.otpAnswerFloorMs ?? POSTMARK_TIMEOUT_MS + 3_000 + 1_000;
  /** Better Auth at /api/auth/*. A request that mails a code runs under its address's lock (otp-send-lock.ts), so two
   *  at the same moment mail one code; everything else goes straight through.
   *  A reset or verification code is mailed only when the address has an account, and Better Auth answers an unknown
   *  address before sending anything: the time told who is a member. Those answers are held until a floor (send timeout
   *  + ops webhook timeout + a margin — the longest a failing member send takes) has passed since the request came in —
   *  counted before the lock, so waiting on it tells nothing either, and waited out after the lock is released, so no
   *  connection is held meanwhile. A sign-in code goes to every address asked (nothing to hide, and a failure must
   *  reach Join at once); a 429 stays immediate (it is per IP). */
  const handler: Auth["handler"] = (req) => forgettingSessions(req, () => answer(req));
  const answer: Auth["handler"] = async (req) => {
    if (!isOtpSendRequest(req)) return auth.handler(req);
    const receivedAt = performance.now();
    const target = await otpSendTarget(req);
    // Only what the club read as a sign-in code answers at once. A reset or verification code waits, and so does a body
    // the club could not read the way Better Auth reads it (another content type): it may be a reset code all the same.
    // A failure (a query that failed leaves Better Auth's handler for the host's 500) waits too.
    const held = target?.type !== "sign-in";
    let res: Response;
    try {
      res = target ? await withOtpSendLock(target, () => auth.handler(req)) : await auth.handler(req);
    } catch (err) {
      if (held) await waitUntil(receivedAt + answerFloorMs);
      throw err;
    }
    if (held && res.status !== 429) await waitUntil(receivedAt + answerFloorMs);
    return res;
  };

  return {
    handler,
    getSession,
    requireMember,
    requireRole,
    deleteAccount,
    listUsersCreatedBefore,
    registeredEmail,
  };
}

/** Waits until `deadline` (a performance.now() time). A timer can wake a fraction of a millisecond early: look again. */
async function waitUntil(deadline: number): Promise<void> {
  for (let left = deadline - performance.now(); left > 0; left = deadline - performance.now()) {
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(left)));
  }
}
