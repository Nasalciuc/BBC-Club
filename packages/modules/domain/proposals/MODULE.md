# domain/proposals

**Owns:** schema `proposals.*` — offers (idempotency_key UNIQUE, source, targeting XOR target_member_id, route, cabin, price/published_price, flight_facts, rating, validity, status), offer_targets (segment fan-out, PK offer+member).
**Rating** (ADR-IMPL-056, 0032): `offers.rating numeric(2,1)`, the rating the offer's cards print beside the city (02, 16: `★ 4.8`) — given by the sender in the ingest's optional `rating` (a number from 1 to 5, one decimal place at most), never computed here; null without one. The BFF's `ProposalCardVM.rating` (and so the detail's, Home's and the feed's cards) reads it as a number, null when absent.
**Publishes:** `offer.published` (same tx as insert), `offer.expired`, `offer.withdrawn`.
**Consumes:** `personalization.candidate_accepted` (v2) → publish. `member.deleted` → delete `offer_targets` for that member.
**Ports:** none (S2S ingestion is a route in this module, guarded by `proposals:ingest`).
**Facade:** `feed(actor, cursor)`, `getVisible(actor, offerId)` (null → 404 upstream), `getAny(offerId)` (system/operator), `ingest(input, idempotencyKey)`, `withdraw(offerId, reason)`.
**Jobs:** `expire-offers` (every 5 min: active & valid_until < now → expired + event).
**Out of scope:** pricing logic, booking, GDS lookups, request-a-proposal (`domain/requests`, decision pending).
**Invariants tested:** same idempotency key → same offer id (200) · same key different payload → 409 · targeting XOR (CHECK) · price > 0, published ≥ price, valid_until > publish_at (CHECK) · a rating from 1.0 to 5.0 (CHECK), refused by the ingest outside it or past one decimal place, and compared on a retry like every stored field · feed visibility = active ∧ published (publish_at ≤ now: a later one is a schedule, in no feed, no Home and 404 by id until then) ∧ valid ∧ (broadcast ∨ mine ∨ my segment) · expire publishes exactly once.
