# domain/engagement

**Owns:** schema `engagement.*` — offer_responses (kept expand-only; respond HTTP path removed in Branch 3).
**Publishes:** none (offer.responded retired with respond).
**Consumes:** `member.deleted` → wipe offer_responses. Journal tombstone runs in `personalization.onMemberDeleted` so every sibling still sees the payload.
**Ports:** none.
**Facade:** `get`, `responsesFor`, `upsert`, `markSynced` — feed enrichment for legacy offer cards until Branch 5.
**Out of scope:** CRM sync, respond-to-offer (requests module), analytics.
**Invariants tested:** upsert setWhere; member delete cascade.
