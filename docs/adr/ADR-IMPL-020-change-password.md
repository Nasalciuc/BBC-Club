# ADR-IMPL-020 — Changing a password requires the current one

Status: accepted · Date: 2026-09-25 · Amends nothing. ADR-PROD-001 still describes Path A (OTP session → first `setPassword`). `packages/shared` is ADR-gated (`PasswordBody`).

**Context.** `POST /v1/account/password` always called Better Auth `setPassword({ newPassword })`. Path A (no credential yet) needs that. A member who already has a credential — the profile sheet — could not rotate the password: the pre-fix probe on a signed-up member with `{ newPassword }` only returned **400**. The sheet collected the current password and dropped it.

**Decision.**

1. `PasswordBody.currentPassword` is optional.
2. No credential → `auth.api.setPassword` as today (Entry / Path A unchanged).
3. Credential present → `currentPassword` is required. Call `auth.api.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` as typed on Better Auth **1.6.31**.
4. Wrong current password → 400 _That password isn't right._

**Consequence.** First-time set stays 200 without `currentPassword`. A change without it, or with the wrong one, is 400. A correct change is 200 and other sessions die.
