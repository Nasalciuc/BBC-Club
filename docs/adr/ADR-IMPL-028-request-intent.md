# ADR-IMPL-028 — Request intent

Status: accepted · Date: 2026-10-01 · Authorizes the `packages/shared` change for optional `intent` and `replacesFareId`.

**Context.** An alternative reaches the operator identical to any other request. The member app never sees the distinction: `RequestVM` stays as it is.

**Decision.** Optional `intent` (`quote` or `alternative`) and optional `replacesFareId`. Two nullable columns, no foreign key. `effectiveIntent` is `intent`, or `fare` when a fare id is set, or `offer` when an offer id is set, otherwise `quote`.

**Consequence.** The contract and `request.submitted` stay backward-compatible: the new event fields are optional, so journal rows written before this change still parse. `RequestVM` is unchanged.
