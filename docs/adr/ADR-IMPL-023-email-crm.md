# ADR-IMPL-023 — Email is the interim CRM, and operator links are signed

Status: accepted · Date: 2026-09-27 · Amends nothing. `packages/shared` is ADR-gated (`ServerEnv`).

**Context.** The HTTP CRM adapter still waits on a written contract. Operators need a way to mark a request quoted, booked, or closed without a session, and a GET from a mail client must not change anything.

**Decision.**

1. `CRM_ADAPTER` may be `email`. It stays `mock` unless env says otherwise. `http` still throws.
2. `OPERATORS_EMAIL` and `OPS_LINK_SECRET` (at least 32 characters) are required when `CRM_ADAPTER=email`.
3. An operator link is an HMAC over one request id, one status, and a one-week expiry. GET confirms. POST is the only transition.

**Consequence.** A mailbox preview cannot mark a request. The secret never appears in the message.
