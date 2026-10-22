import { createHash } from "node:crypto";

/**
 * The headers of every per-member GET that answers with an ETag (Home, the feed). `no-cache`: a client keeps the body
 * but asks again each time — the ETag's 304 still spares it the body — so a shared cache cannot serve one member's
 * answer to the next. iOS's shared URL cache keys on the URL, not on the session's cookie, and with `max-age=300` it
 * served member A's Home to member B on the same phone for five minutes. `Vary` names the headers the answer depends
 * on, for any cache that does key on them. A 304 carries them too (RFC 9110 §15.4.5).
 */
export const PER_MEMBER_CACHE = { "Cache-Control": "private, no-cache", Vary: "Cookie, Authorization" } as const;

/** A strong ETag over the value as JSON: whatever the body shows changes it. */
export function etagOf(value: unknown): string {
  return `"${createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16)}"`;
}

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
