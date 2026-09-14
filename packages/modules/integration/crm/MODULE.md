# integration/crm

**Owns:** schema `crm.*` — mirror (read-only projection: crm_client_id PK, email_normalized UNIQUE, route_history, advisor, deleted_at soft-delete), sync_runs.
**Publishes:** `crm.mirror.synced` (one per run), `crm.activity_created` (noConsumer).
**Consumes:** `offer.responded` (interested only) → createActivity with external_id offerId:memberId, retry/DLQ · `member.deleted` → "account deleted" activity.
**Ports (defines):** `CRMConnector { findByEmail, createActivity }`; adapters: `http` (real), `mock` (tests/dev).
**Facade:** `findByEmail(emailNormalized)` (members), `mirrorFor(memberId)` (personalization), `freshness()` (fresh < 24 h · stale < 72 h · unavailable).
**Jobs:** `sync-mirror` (nightly 03:00 + on demand: one read-only SELECT, upsert batches of 5000, soft-delete, sync_runs), `reconcile-activities` (15 min: unsynced > 10 min by external_id), `waitlist-recheck`.
**Out of scope:** writing anything to the CRM except activities; CRM schema knowledge outside the single sync SELECT.
**Invariants tested:** CRM down → delivery retried, activity created exactly once after recovery (external_id) · sync failure at batch k leaves batches < k consistent and run failed · soft-delete never hard-deletes · freshness derived from last succeeded run.
