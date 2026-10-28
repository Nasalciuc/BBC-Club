import { createHash } from "node:crypto";
import type { SessionInfo } from "../api";

/** Sessions each process keeps; past it the oldest goes first. ~200 bytes each: 10 000 members are ~2 MB. */
export const SESSION_CACHE_ENTRIES = 10_000;

/** How long a forgotten token or member stays noted past the cache's time. A read still waiting when its note goes
 *  (PgBouncer may hold a query longer) puts nothing back either: every note dropped raises the floor under `put`. */
export const FORGOTTEN_MARGIN_MS = 30_000;

type Metrics = { inc: (name: string, labels?: Record<string, string>) => void };
type Entry = { info: SessionInfo; until: number };
/** When a token or a member was forgotten: its place in the sequence reads begin in, and the clock. */
type Note = { seq: number; at: number };

/**
 * The value of the cookie `name` as Better Auth reads it (better-call's `parseCookies`, which its `getSignedCookie`
 * reads): the first cookie of that name only, trimmed, unquoted, decoded when it holds a `%`. Better Auth reads one
 * name (`authCookies.sessionToken`: `__Secure-` only with secure cookies), so no other cookie may stand for it.
 */
function cookieValue(headers: Headers, name: string): string | null {
  const str = headers.get("cookie");
  if (!str) return null;
  for (let index = 0; index < str.length;) {
    const eq = str.indexOf("=", index);
    if (eq === -1) return null;
    let end = str.indexOf(";", index);
    if (end === -1) end = str.length;
    else if (end < eq) {
      index = str.lastIndexOf(";", eq - 1) + 1;
      continue;
    }
    if (str.slice(index, eq).trim() === name) {
      let value = str.slice(eq + 1, end).trim();
      if (value.codePointAt(0) === 34) value = value.slice(1, -1);
      try {
        return (value.includes("%") ? decodeURIComponent(value) : value) || null;
      } catch {
        return value || null;
      }
    }
    index = end + 1;
  }
  return null;
}

/** Better Auth's `bearer()` reads a session from `Authorization: bearer …` (the scheme in any case) before the cookie:
 *  such a request is neither answered from nor kept in the cache, which follows the cookie alone. */
export function carriesBearer(headers: Headers): boolean {
  return headers.get("authorization")?.slice(0, 7).toLowerCase() === "bearer ";
}

/** The key a request's session is kept under: a hash of the signed token in the cookie `name` (the one Better Auth
 *  reads the session from), never the token itself. */
export function sessionKey(headers: Headers, name: string): string | null {
  const value = cookieValue(headers, name);
  return value ? createHash("sha256").update(value).digest("base64url") : null;
}

/** The session token inside the cookie `sessionKey` hashes (before its signature, as `getSignedCookie` splits it),
 *  checked against the token Better Auth verified before an answer is kept. */
export function keyedToken(headers: Headers, name: string): string | null {
  const value = cookieValue(headers, name);
  return value ? value.slice(0, Math.max(value.lastIndexOf("."), 0)) || null : null;
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
 * account deletion forget what this process holds for the member. A read begun before its token or its member was
 * forgotten puts nothing back (`begin` / `put`'s `since`); the note is per token and per member, so forgetting one
 * never costs another member's entry. Another replica may answer from its entry for the rest of the minute — the
 * window ADR-IMPL-027 accepted for the cookie cache, which the phone holds just as long.
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
  /** One sequence for the reads begun and the forgets: a forget noted after a read began has the larger number. */
  let seq = 0;
  const keyForgot = new Map<string, Note>();
  const memberForgot = new Map<string, Note>();
  const keepNoteMs = opts.ttlMs + FORGOTTEN_MARGIN_MS;
  /** The highest note dropped: a read begun before it may have been due to be stopped by it, so it puts nothing back. */
  let floor = 0;
  /** The member behind a token whose answer was not put back, so a sign-out or a deletion with that token still
   *  forgets the member's other entries (`memberOf`). Kept and bounded as the notes are. */
  const skippedMember = new Map<string, { member: string; at: number }>();

  /** Oldest first, past the keep time or past the cap; `onDrop` sees each one dropped. */
  function trim<T extends { at: number }>(map: Map<string, T>, onDrop?: (v: T) => void): void {
    const oldest = now() - keepNoteMs;
    for (const [k, v] of map) {
      if (v.at > oldest && map.size < maxEntries) break;
      onDrop?.(v);
      map.delete(k);
    }
  }
  /** Notes in the order they were made, so the oldest go first. */
  function note(notes: Map<string, Note>, id: string): void {
    notes.delete(id);
    trim(notes, (n) => (floor = Math.max(floor, n.seq)));
    notes.set(id, { seq: ++seq, at: now() });
  }
  const forgotSince = (notes: Map<string, Note>, id: string, since: number) => (notes.get(id)?.seq ?? 0) > since;

  return {
    /** Taken before a read; passed to `put` with its answer. */
    begin: () => ++seq,
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
    /** Kept until the cache's time has passed or the session expires, whichever is first — not at all when the token
     *  or its member was forgotten after the read began (`since`, from `begin`), or a note that could have said so is
     *  gone. The member is still remembered for `memberOf`. */
    put(key: string, info: SessionInfo, expiresAt: Date | null, since?: number): void {
      if (
        since !== undefined &&
        (since < floor || forgotSince(keyForgot, key, since) || forgotSince(memberForgot, info.member.id, since))
      ) {
        skippedMember.delete(key);
        trim(skippedMember);
        skippedMember.set(key, { member: info.member.id, at: now() });
        return;
      }
      const until = Math.min(now() + opts.ttlMs, expiresAt ? expiresAt.getTime() : Number.POSITIVE_INFINITY);
      if (until <= now()) return;
      entries.delete(key);
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
      entries.set(key, { info, until });
    },
    /** The member a token's entry belongs to — or, when its answer was not put back, the member that answer named —
     *  without counting a hit or a miss. */
    memberOf(key: string): string | null {
      return entries.get(key)?.info.member.id ?? skippedMember.get(key)?.member ?? null;
    },
    forget(key: string): void {
      note(keyForgot, key);
      entries.delete(key);
    },
    /** Every session this process keeps for the member: after a sign-out, a password change, a deletion. */
    forgetMember(memberId: string): void {
      note(memberForgot, memberId);
      for (const [k, e] of entries) if (e.info.member.id === memberId) entries.delete(k);
    },
    size: () => entries.size,
    /** Tokens and members noted as forgotten, and members of answers not put back (for tests: they are bounded). */
    notes: () => keyForgot.size + memberForgot.size + skippedMember.size,
  };
}
export type SessionCache = ReturnType<typeof createSessionCache>;
