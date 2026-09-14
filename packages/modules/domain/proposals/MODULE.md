# domain/proposals

**Owns:** schema `proposals.*` — offers (idempotency_key UNIQUE, source, targeting XOR target_member_id, route, cabin, price/published_price, flight_facts, validity, status), offer_targets (segment fan-out, PK offer+member).
**Publishes:** `offer.published` (same tx as insert), `offer.expired`, `offer.withdrawn`.
**Consumes:** `personalization.candidate_accepted` (v2) → publish.
**Ports:** none (S2S ingestion is a route in this module, guarded by `proposals:ingest`).
**Facade:** `feed(actor, cursor)`, `getVisible(actor, offerId)` (null → 404 upstream), `getAny(offerId)` (system/operator), `ingest(input, idempotencyKey)`, `withdraw(offerId, reason)`.
**Jobs:** `expire-offers` (every 5 min: active & valid_until < now → expired + event).
**Out of scope:** pricing logic, booking, GDS lookups, request-a-proposal (`domain/requests`, decision pending).
**Invariants tested:** same idempotency key → same offer id (200) · same key different payload → 409 · targeting XOR (CHECK) · price > 0, published ≥ price, valid_until > publish_at (CHECK) · feed visibility = active ∧ valid ∧ (broadcast ∨ mine ∨ my segment) · expire publishes exactly once.
