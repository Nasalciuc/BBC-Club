# domain/requests

**Owns:** schema `requests.*` — `requests` (member fare/offer requests), `request_events` (status timeline).
**Publishes:** `request.submitted` (same tx as insert), `request.status_changed` (CRM webhook).
**Consumes:** `request.submitted` → `requests.onRequestSubmitted` (records that the row is ready to send; no network). The partner call lives in `send-requests`. `member.deleted` → redact contact fields, null `member_id`, close the row (operator may still have a CRM lead).
**Ports:** `crm.submitRequest(payload) → { crmRequestId }`; `catalog.indicativeFor(route, cabin)` — the estimate a quote's search showed (ADR-IMPL-042), asked before the insert, never fatal (a failed lookup logs and counts `bbc_request_estimates_unavailable{reason="error"}`).
**Facade:** `listForMember`, `get`, `toRequestVM`. `RequestVM.route` is the outbound leg (`requestRoute`: a round trip's last leg comes home) and `city` the destination's city, one batched `catalog.getAirports` per page; `tripType` and `phone` (the number the
specialist calls) for the detail; a request not passed on yet reads `received` until `send-requests` gives up, then
`not_sent` (ADR-IMPL-042).
**Out of scope:** catalog/fares, campaigns, respond-to-offer (deleted — one request path only).
**Invariants tested:** Idempotency-Key → one row · another member reusing the key → 409 · IDOR → 404 · ownership in WHERE · send-requests stops after six · CRM mock records payload. Estimate (ADR-IMPL-042): only on a quote, recomputed by the server (a price in the body is dropped), the search's own number, none beside published fares or outside North America, none on a replay · the member's note reaches the specialist.
