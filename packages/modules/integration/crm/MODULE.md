# integration/crm

**Owns:** schema `crm.*` — mirror (read-only projection: crm_client_id PK, email_normalized UNIQUE, route_history, advisor, deleted_at soft-delete), sync_runs.
**Publishes:** `crm.mirror.synced` (one per run), `crm.activity_created` (noConsumer).
**Consumes:** none in this branch (`offer.responded` retired; `member.deleted` activity is stage 5).
**Ports (defines):** `CRMConnector { findByEmail, createActivity, submitRequest }` — every outbound call is `AbortSignal.timeout(5000)` and surfaces `CrmTimeoutError` on abort. Adapters: `http` (stage 5), `mock` (tests/dev).
**Facade:** `findByEmail(emailNormalized)` (members), `submitRequest` (requests module). Mirror/freshness stay stage 5.
**Jobs:** none registered (`crmModule` returns `jobs: []`; `POST /v1/internal/run/<job>` answers 404 for each). Planned and not built (stage 5, ADR-IMPL-021): `sync-mirror` (nightly 03:00 + on demand: one read-only SELECT, upsert batches of 5000, soft-delete, sync_runs), `reconcile-activities` (15 min: unsynced > 10 min by external_id), `waitlist-recheck` — not built.
**Request e-mail (`email` adapter):** `CrmRequestPayload` (api) is what `send-requests` hands over; past the trip and the contact every field is optional, so `mock` and other adapters keep working. The operator's e-mail opens `New quote|alternative|offer|fare request R-…`, names the fare (`Fare <id> — British Airways — $4,200 (published $7,850, Sabre · 16 Sep)`) or the offer (`Offer <title> — <id> — $3,900`) only with what the request recorded, and a resend (`_attempt` > 1: a send that timed out may have delivered the first copy) says so — the subject starts `Resent (attempt n) — may duplicate:` and the text `If R-… already reached you, ignore this copy.`; the reference is the key the copies share.
**Out of scope:** writing anything to the CRM except activities; CRM schema knowledge outside the single sync SELECT.
**Invariants tested:** CRM down → delivery retried, activity created exactly once after recovery (external_id) · sync failure at batch k leaves batches < k consistent and run failed · soft-delete never hard-deletes · freshness derived from last succeeded run.
