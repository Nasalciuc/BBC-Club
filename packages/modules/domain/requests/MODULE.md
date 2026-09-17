# domain/requests

**Owns:** schema `requests.*` — `requests` (member fare/offer requests), `request_events` (status timeline).
**Publishes:** `request.submitted` (same tx as insert), `request.status_changed` (CRM webhook).
**Consumes:** `request.submitted` → `requests.onRequestSubmitted` (eager CRM `submitRequest`; job retries).
**Ports:** `crm.submitRequest(payload) → { crmRequestId }`.
**Facade:** `listForMember`, `get`, `toRequestVM`.
**Out of scope:** catalog/fares, campaigns, respond-to-offer (deleted — one request path only).
**Invariants tested:** Idempotency-Key → one row · another member reusing the key → 409 · IDOR → 404 · ownership in WHERE · send-requests stops after six · CRM mock records payload.
