# ADR-IMPL-012 — Post-merge hardening: typed handlers, computed phone, retired events

Status: accepted · Date: 2026-09-18 · Supersedes nothing; amends ADR-IMPL-009 (rules as build failures) and ADR-IMPL-011 (request contracts).

**Context.** THE BUILD §5.3 and ADDITIONS_PLAN §2.2 were written before the code that broke them: a CRM call inside the poller's delivery transaction, and `phone_valid: true` as a literal. `packages/shared` is ADR-gated.

**Decision.**

1. `HandlerContext` in `packages/shared/src/module-contract.ts` is the type of every consumer handler. `ctx.db` does not exist; the poller passes `tx`, `logger`, `deliveryId`, `event`, `principal`, `attempt`, `signal`.
2. `RequestBody.contact.phone` is refined with `libphonenumber-js` (same rule as the app). Invalid numbers are 400 with the field named.
3. `offer.responded` stays in the catalogue as `deprecated: "branch-3"`. `deprecated` implies no live consumer; `noConsumer` is not set alongside it. The inventory skip is OR (`noConsumer || deprecated`), not XOR — both flags together would still be excused, but the second is redundant. The schema is kept so historical journal rows parse.
4. `request.status_changed.route` is optional so old journal rows still parse.

**Consequence.** `scripts/check-modules.ts` fails an `await ports.(crm|email|push)` inside a consumer handler. A rule that lives only in a document will be broken again; these two are now build failures.
