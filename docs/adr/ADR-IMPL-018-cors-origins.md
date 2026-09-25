# ADR-IMPL-018 — CORS_ORIGINS is one list for CORS and Better Auth

Status: accepted · Date: 2026-09-25 · Amends nothing. `packages/shared` is ADR-gated (`env.ts`).

**Context.** Metro web and a LAN origin were hardcoded next to CORS and again inside `createAuth.trustedOrigins`. The two lists could diverge. A personal RFC1918 address must never ship. The operator panel will later live on a public https origin.

**Decision.**

1. `CORS_ORIGINS` is a comma-separated env string (default empty). `authOrigins(env)` is `[APP_ORIGIN, MOBILE_SCHEME://, ...extras]`. Host CORS and Better Auth `trustedOrigins` both call that function — one list.
2. Production `loadEnv()` rejects extras that are insecure: non-https, localhost, loopback, and RFC1918 private IPv4 (see `isInsecureOrigin`). A public `https://` extra is allowed (operator later). Development and test may set Metro / LAN origins in `.env` only.
3. No extra origin is hardcoded in source.

**Consequence.** Chrome-on-Metro Join works when the local `.env` lists those origins. A production boot with a LAN extra fails at `loadEnv()`. Adding the operator origin later is an env change, not a second allowlist.
