# integration/crm

**Owns:** schema `crm.*` — mirror (read-only projection: crm_client_id PK, email_normalized UNIQUE, route_history, advisor, deleted_at soft-delete), sync_runs.
**Publishes:** `crm.mirror.synced` (one per run), `crm.activity_created` (noConsumer).
**Consumes:** none in this branch (`offer.responded` retired; `member.deleted` activity is stage 5).
**Ports (defines):** `CRMConnector { findByEmail, createActivity, submitRequest }`; adapters: `http` (real), `mock` (tests/dev).
**Facade:** `findByEmail(emailNormalized)` (members), `submitRequest` (requests module). Mirror/freshness stay stage 5.
**Jobs:** `sync-mirror` (nightly 03:00 + on demand: one read-only SELECT, upsert batches of 5000, soft-delete, sync_runs), `reconcile-activities` (15 min: unsynced > 10 min by external_id), `waitlist-recheck`.
**Out of scope:** writing anything to the CRM except activities; CRM schema knowledge outside the single sync SELECT.
**Invariants tested:** CRM down → delivery retried, activity created exactly once after recovery (external_id) · sync failure at batch k leaves batches < k consistent and run failed · soft-delete never hard-deletes · freshness derived from last succeeded run.
