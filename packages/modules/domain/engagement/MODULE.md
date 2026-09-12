# domain/engagement
**Owns:** schema `engagement.*` — offer_responses (PK offer+member, response interested/dismissed, synced_to_crm, crm_activity_id).
**Publishes:** `offer.responded` (same tx as upsert), `offer.viewed` (noConsumer).
**Consumes:** none (crm and notifications consume offer.responded).
**Ports:** `Proposals.getVisible` (domain/proposals).
**Facade:** `respond(principal, input)`, `recordView(principal, offerId)`, `responsesFor(actor, offerIds)`, `markSynced(actor, offerId, crmActivityId)`.
**Out of scope:** any CRM call (crm consumes the event), analytics aggregation (journal).
**Invariants tested:** second identical tap → no-op, same state · dismissed after interested → updated · closed offer → NOT_FOUND/GONE · memberId in body ignored · handler with wrong actor cannot markSynced (0 rows → throws).
