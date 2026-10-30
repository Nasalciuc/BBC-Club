import { createHash } from "node:crypto";

/**
 * The headers of every per-member GET that answers with an ETag (Home, the feed). `no-cache`: a client keeps the body
 * but asks again each time — the ETag's 304 still spares it the body — so a shared cache cannot serve one member's
 * answer to the next. iOS's shared URL cache keys on the URL, not on the session's cookie, and with `max-age=300` it
 * served member A's Home to member B on the same phone for five minutes. `Vary` names the headers the answer depends
 * on, for any cache that does key on them. A 304 carries them too (RFC 9110 §15.4.5).
 */
export const PER_MEMBER_CACHE = { "Cache-Control": "private, no-cache", Vary: "Cookie, Authorization" } as const;

/**
 * If-None-Match as RFC 9110 §13.1.2 reads it: `*`, or a list of entity tags compared weakly (a `W/` prefix on either
 * side is ignored). True when the client's copy is the current one.
 */
export function ifNoneMatchHits(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  const current = opaque(etag);
  return header.split(",").some((tag) => tag.trim() === "*" || opaque(tag) === current);
}

/** Members whose last answer each process remembers; past it the oldest goes first. About 320 bytes each (measured on
 *  Bun, 100 000 entries): 20 000 members take about 6 MB. */
export const REVALIDATION_ENTRIES = 20_000;
/** The versions' clock: what moves with time alone (an offer's publish or expiry, a fare's day, a stored site price)
 *  is reread at least this often. */
export const VERSION_MINUTE_MS = 60_000;

/**
 * ADR-IMPL-075: a per-member GET's fast 304. The answer's ETag stays the hash of the body (whatever it shows changes
 * it); beside it, the process remembers, per member, the versions the body was computed from — the generations of
 * the tables it reads, what of the member's own row it uses, and the minute. A request whose versions are the
 * remembered ones and whose If-None-Match is the remembered tag answers 304 before any of the body's reads. Anything
 * else computes the body, as before, and remembers it. What moves with time alone moves the minute: a body is never
 * trusted for longer than that past a change its versions do not see.
 */
export function createRevalidation(opts: { maxEntries?: number; now?: () => number } = {}) {
  // The wall clock on purpose: every replica must agree on the minute a version is read in.
  const now = opts.now ?? Date.now;
  const maxEntries = opts.maxEntries ?? REVALIDATION_ENTRIES;
  const last = new Map<string, { versions: string; etag: string }>();

  return {
    /** The versions' key: the parts given, and the minute. */
    versions(parts: readonly unknown[]): string {
      return JSON.stringify([...parts, Math.floor(now() / VERSION_MINUTE_MS)]);
    },
    /** True when the phone holds the body these versions gave last time (the caller answers 304). */
    unchanged(member: string, versions: string, ifNoneMatch: string | undefined): string | null {
      const hit = last.get(member);
      return hit && hit.versions === versions && ifNoneMatchHits(ifNoneMatch, hit.etag) ? hit.etag : null;
    },
    /** The tag of the body these versions gave, remembered for the member. */
    remember(member: string, versions: string, etag: string): void {
      last.delete(member);
      if (last.size >= maxEntries) last.delete(last.keys().next().value as string);
      last.set(member, { versions, etag });
    },
    size: () => last.size,
  };
}
export type Revalidation = ReturnType<typeof createRevalidation>;

/** The body serialised once, and a strong ETag over that JSON (and over `also`: what the answer depends on that the
 *  body does not show). */
export function serialised(body: unknown, also = ""): { json: string; etag: string } {
  const json = JSON.stringify(body);
  const etag = `"${createHash("sha1").update(also).update("\n").update(json).digest("hex").slice(0, 16)}"`;
  return { json, etag };
}

/** The JSON a route already serialised, with the headers c.json would set. */
export const JSON_HEADERS = { "Content-Type": "application/json" } as const;
