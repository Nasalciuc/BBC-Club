# domain/campaigns (stage 3)
**Owns:** schema `campaigns.*` — campaigns (name, segment definition, schedule, status), campaign_runs.
**Publishes:** `campaign.scheduled`, `campaign.dispatched`.
**Consumes:** `crm.mirror.synced` (segment recomputation).
**Ports:** `Proposals.ingest` (publishes the resulting offers with targeting=segment + offer_targets).
**Facade:** `schedule(operator, campaign)`, `dispatch(campaignId)` (system), `segmentMembers(definition)`.
**Out of scope:** A/B testing (flags), email campaigns.
**Invariants tested:** dispatch idempotent per run · segment evaluation in SQL · broadcast throttled through notifications (≤20/s), never bypassing consent.
