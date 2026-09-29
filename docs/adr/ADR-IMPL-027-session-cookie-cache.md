# ADR-IMPL-027 — Session cookie cache lifetime

Status: accepted · Date: 2026-09-28 · Touches Better Auth `cookieCache.maxAge` via `SESSION_COOKIE_CACHE_SECONDS`.

**Context.** A 5-minute cookie cache lets most member requests skip the session row — and lets a password change that calls `revokeOtherSessions` keep working on another device for up to five minutes.

**Decision.** Default **60 seconds** (min 10, max 300). At ~1,000 RPS that is at most one session read per active member per minute. Operators set `SESSION_COOKIE_CACHE_SECONDS` without a deploy of auth code.

**Consequence.** A revoked session is unusable on another device after the cache TTL. CPU on hot GETs stays dominated by the query, not by session reads.
