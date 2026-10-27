# domain/engagement

**Owns:** schema `engagement.*` — offer_responses (kept expand-only; respond HTTP path removed in Branch 3).
**Publishes:** none (offer.responded retired with respond).
**Consumes:** `member.deleted` → wipe offer_responses. Journal tombstone runs in `personalization.onMemberDeleted` so every sibling still sees the payload.
**Ports:** none.
**Facade:** `get`, `responsesFor`, `upsert`, `markSynced`. Home, the feed and an offer's page do not read them (ADR-IMPL-075, ⚑7a): nothing in production writes a response yet; the read comes back with the feature that writes one.
**Out of scope:** CRM sync, respond-to-offer (requests module), analytics.
**Invariants tested:** upsert setWhere; member delete cascade.
