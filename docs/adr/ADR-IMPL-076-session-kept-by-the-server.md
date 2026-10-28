# ADR-IMPL-076 — The server keeps each session for the cookie cache's minute

Status: proposed · Date: 2026-10-26 · Scope: `packages/modules/core/identity` (`application/session-cache.ts`, the
facade's `getSession`, `handler` and `deleteAccount`, the password route) · Amends ADR-IMPL-027 (where the minute is
kept).

**Context.** ADR-IMPL-027 promised one session read per active member per minute: Better Auth's cookie cache
(`session_data`, signed, `SESSION_COOKIE_CACHE_SECONDS`) lets a request skip the session row. The app does not keep that
promise for `/v1`: its Better Auth client refreshes the cookie only on `get-session` (opening the app, coming back to
the foreground; `refetchInterval: 0`), and the API's principal calls `auth.api.getSession` without handing the refreshed
cookie back. After the first minute every request carries the token alone and Better Auth reads `auth.session` and
`auth.user` — two statements and 1.4–1.9 ms of CPU on each request.

**Decision.**

1. **Each process keeps the session behind a token** for at most `SESSION_COOKIE_CACHE_SECONDS`, never past the
   session's own expiry, keyed by a hash of the signed token (never the token) in the one cookie Better Auth reads the
   session from (`authCookies.sessionToken`: `__Secure-` only with secure cookies; the first of that name, read as
   Better Auth reads it), never another cookie of the same name, and kept only when the token Better Auth verified is
   that cookie's. A request with a bearer token (`Authorization: bearer …`, any case), which Better Auth's `bearer()`
   reads instead of the cookie, is neither answered from nor kept in the cache. Only a verified member's session is
   kept; an anonymous or unverified answer is asked again.
2. **A miss reads fresh** (`disableCookieCache`), so nothing is kept that the database did not say within the minute.
   A write (`POST`, `PUT`, `PATCH`, `DELETE`) reads fresh as before and puts its answer back, or forgets the token.
3. **Forgetting.** A write to `/api/auth/*` (sign-out, revoke, change), a password change through
   `/v1/account/password` and an account deletion forget what this process keeps for the member. A read that began
   before its token or its member was forgotten puts nothing back: the cache notes each forget per token and per
   member (for the cache's time and 30 s more; a note dropped earlier or later raises a floor no older read puts
   under), never one counter for all, since a read that finds no session forgets its token too and a shared counter
   would drop every other member's answer under load. An answer not put back still names its member, so a sign-out or
   a deletion with that token forgets the member's other entries. A write sent with a bearer token forgets the member
   a fresh read finds behind it, before the write.
4. At most 10 000 sessions per process (~2 MB), the oldest first past it; hits and misses counted as `cache_hit` /
   `cache_miss` with `ns="identity.session"`.

**Consequences.**

- Two statements fewer on every member read after the first per minute per replica; `principal.ts` and the app are
  unchanged.
- The window ADR-IMPL-027 accepted stays the window: a session ended on one replica (or in psql) may still read on
  another for the rest of its minute, exactly as the phone's cookie cache would; a write is refused at once there.
- A member deleted on another device: `member.deleted` erases the rows, a write reads fresh, and a read elsewhere may
  pass for the rest of the minute, as before. Deletion never depended on reads.
