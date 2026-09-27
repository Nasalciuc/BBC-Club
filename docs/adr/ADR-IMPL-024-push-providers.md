# ADR-IMPL-024 — Push goes to APNs and FCM, outside the transaction

Status: accepted · Date: 2026-09-27 · Amends nothing. `packages/shared` is ADR-gated (`ServerEnv`).

**Context.** Dispatch used to call the push provider while it still held a row lock. A slow Apple or Google response held that transaction open. The app also asked for notification permission at launch, before the member had a reason.

**Decision.**

1. iOS uses APNs HTTP/2 with a token (`.p8`, ES256). Android uses FCM HTTP v1 with a service-account (RS256). The notification id is the collapse id.
2. `PUSH_ADAPTER` is `recording` or `live`. Dev, test, and staging may stay `recording` so the API boots before Apple and Firebase keys exist. `live` requires every `APNS_*` field and `FCM_SERVICE_ACCOUNT_BASE64`. Keys stay in env, base64, never in the repo. A production process on `recording` logs one warning and sets the `push_live` gauge to 0.
3. Dispatch claims and rechecks consent in one short transaction, sends with no transaction open, then records the outcome. A row left in `sending` returns to `pending` after five minutes.
4. The phone asks once, after the first request is received, and only if the system has never asked. Launch does not show the dialog.

**Consequence.** A provider outage cannot pin a database transaction. Staging boots on `recording` so the email-CRM proof does not wait on push keys. A phone proof is after `PUSH_ADAPTER=live` and the keys are in env, not a merge gate.
