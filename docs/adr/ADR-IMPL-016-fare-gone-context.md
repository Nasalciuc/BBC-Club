# ADR-IMPL-016 — FareVM.offerId and ApiError.context

Status: accepted · Date: 2026-09-22 · Amends ADR-IMPL-011 (flight contracts) and ADR-IMPL-015. `packages/shared` is ADR-gated.

**Context.** Fare detail used fixture prices and a fake advisor when a fare was gone or when an offer photo was needed. `ApiError.details` is validation-only (`{ path, message }[]`) and must not carry closed-fare facts. Catalog must not JOIN proposals.

**Decision.**

1. `FareVM.offerId: z.string().uuid().nullable()` — optional promotional offer linked at composition time. Catalog HTTP routes pass `null`; the mobile app may also receive `offerId` as a navigation param from Explore when the offer→fare map is known.
2. `ApiError.error.context` is optional `z.record(z.unknown())`. Only **GONE (410)** may set it (closed fare: `price`, `currency`, `validUntil`, `from`, `to`). Never attach `context` on 401/403 or any authz denial — those must not identify another member's resource.
3. Clients treat `context` as optional. Generic `failFromBody` keeps reading `code`/`message` only; GONE handlers may peek at `context` when present.

**Consequence.** Old app builds ignore unknown JSON keys when 410 starts sending `context`. Missing `context` still renders “This fare has closed.” without a price.
