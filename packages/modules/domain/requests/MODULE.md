# domain/requests

**Owns:** schema `requests.*` — `requests` (member fare/offer requests), `request_events` (status timeline). `source` is `request_source` (`ios`|`android`); `fare_id`/`offer_id`/`crm_request_id` are indexed (db:verify extras `0007_requests_verify_fitness.sql`).
**Publishes:** `request.submitted` (same tx as insert), `request.status_changed` (CRM webhook).
**Consumes:** `request.submitted` → `requests.onRequestSubmitted` (eager CRM `submitRequest`; job retries).
**Ports:** `crm.submitRequest(payload) → { crmRequestId }`.
**Facade:** `listForMember`, `get`, `toRequestVM`.
**Out of scope:** catalog/fares, campaigns, respond-to-offer (deleted — one request path only).
**Invariants tested:** Idempotency-Key → one row · another member reusing the key → 409 · IDOR → 404 · ownership in WHERE · send-requests stops after six · CRM mock records payload.
