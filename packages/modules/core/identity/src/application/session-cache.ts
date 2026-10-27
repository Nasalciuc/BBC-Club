import { createHash } from "node:crypto";
import type { SessionInfo } from "../api";

/** Sessions each process keeps; past it the oldest goes first. ~200 bytes each: 10 000 members are ~2 MB. */
export const SESSION_CACHE_ENTRIES = 10_000;

type Metrics = { inc: (name: string, labels?: Record<string, string>) => void };
type Entry = { info: SessionInfo; until: number };

/** The session cookie's value (the signed token), under the club's prefix, secure or not (auth.ts `cookiePrefix`). */
const TOKEN_COOKIE = /(?:^|;\s*)(?:__Secure-)?bbc\.session_token=([^;]+)/;

/** The key a request's session is kept under: a hash of the signed token it carries, never the token itself. */
export function sessionKey(headers: Headers): string | null {
  const token = headers.get("cookie")?.match(TOKEN_COOKIE)?.[1];
  return token ? createHash("sha256").update(token).digest("base64url") : null;
}

/**
 * ADR-IMPL-076: the session behind each token, kept by the process that read it for at most the cookie cache's time
 * (SESSION_COOKIE_CACHE_SECONDS) and never past the session's own expiry. ADR-IMPL-027 promised one read of the
 * session per member per minute; the app sends the token without a fresh `session_data` after the first minute, so
 * Better Auth read Postgres on every request — twice. This holds the answer the cookie cache would have given, on the
 * server, without a release of the app.
 *
 * Only a verified member's session is kept; an anonymous or unverified answer is asked again each time. A write reads
 * fresh and puts its answer back (or forgets the token when there is none); a sign-out, a password change and an
 * account deletion forget what this process holds for the member. Another replica may answer from its entry for the
 * rest of the minute — the window ADR-IMPL-027 accepted for the cookie cache, which the phone holds just as long.
 */
export function createSessionCache(opts: {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
  metrics?: Metrics;
}) {
  const now = opts.now ?? Date.now;
  const maxEntries = opts.maxEntries ?? SESSION_CACHE_ENTRIES;
  const entries = new Map<string, Entry>();

  return {
    get(key: string): SessionInfo | null {
      const hit = entries.get(key);
      if (hit && hit.until > now()) {
        opts.metrics?.inc("cache_hit", { ns: "identity.session" });
        return hit.info;
      }
      if (hit) entries.delete(key);
      opts.metrics?.inc("cache_miss", { ns: "identity.session" });
      return null;
    },
    /** Kept until the cache's time has passed or the session expires, whichever is first. */
    put(key: string, info: SessionInfo, expiresAt: Date | null): void {
      const until = Math.min(now() + opts.ttlMs, expiresAt ? expiresAt.getTime() : Number.POSITIVE_INFINITY);
      if (until <= now()) return;
      entries.delete(key);
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
      entries.set(key, { info, until });
    },
    /** The member a token's entry belongs to, without counting a hit or a miss. */
    memberOf(key: string): string | null {
      return entries.get(key)?.info.member.id ?? null;
    },
    forget(key: string): void {
      entries.delete(key);
    },
    /** Every session this process keeps for the member: after a sign-out, a password change, a deletion. */
    forgetMember(memberId: string): void {
      for (const [k, e] of entries) if (e.info.member.id === memberId) entries.delete(k);
    },
    size: () => entries.size,
  };
}
export type SessionCache = ReturnType<typeof createSessionCache>;
