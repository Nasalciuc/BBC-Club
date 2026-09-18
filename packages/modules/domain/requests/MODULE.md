# domain/requests

**Owns:** schema `requests.*` — `requests` (member fare/offer requests), `request_events` (status timeline).
**Publishes:** `request.submitted` (same tx as insert), `request.status_changed` (CRM webhook).
**Consumes:** `request.submitted` → `requests.onRequestSubmitted` (records that the row is ready to send; no network). The partner call lives in `send-requests`.
**Ports:** `crm.submitRequest(payload) → { crmRequestId }`.
**Facade:** `listForMember`, `get`, `toRequestVM`.
**Out of scope:** catalog/fares, campaigns, respond-to-offer (deleted — one request path only).
**Invariants tested:** Idempotency-Key → one row · another member reusing the key → 409 · IDOR → 404 · ownership in WHERE · send-requests stops after six · CRM mock records payload.
