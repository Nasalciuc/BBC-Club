# ADR-IMPL-042 — The quote request carries the estimate its search showed

Status: accepted · Date: 2026-10-08

**Context.** Since ADR-IMPL-037 an undated search with no published fare in the chosen cabin shows the company's
indicative price (`From $2,055 · round trip`). The member then asks for a quote, and the specialist who calls back did
not know which number the member had seen — the e-mail carried the route, the dates and the travelers only. The company
wants to measure how often an estimate turns into a booking. Approved with P1 on 7 Oct 2026 (sections 9–11 of the P1
debate); split from P1a so the search could ship first.

A defect on the same path, found while building it: the member's note never reached the specialist (`claimUnsent` did
not select it, so the e-mail's note was always empty — and the note is where the app asks members to put their
children's ages).

**Decision.**

- **Recomputed, never received** — at `POST /v1/requests`, a request whose effective intent is `quote` (no `fareId`, no
  `offerId`, not an `alternative`) asks the catalog, through its facade, for the estimate an undated search shows for
  its outbound leg and cabin: `CatalogFacade.indicativeFor`. One function decides for both the search and the request
  (estimates on, valid rules, both airports known, no published fare in that cabin, a route the formula prices), so
  the specialist sees the member's number. `RequestBody` has no estimate field: anything the app sends is dropped by the
  parse. The question is asked after the idempotency and rate-limit checks and before the transaction; a replay never
  asks again. With estimates off it costs no query; with them on, one batched airport read and one fare read
  (`query-budget.test.ts`). It never decides whether a request is accepted: a failed lookup is logged, counted
  (`bbc_request_estimates_unavailable{reason="error"}`) and the request goes through without it.
- **Stored** — `requests.shown_estimate_amount` (integer, whole US dollars) and `shown_estimate_currency` (`USD`), both
  or neither (`requests_shown_estimate` CHECK). Null on every other request.
- **Published** — `request.submitted` gains `shownEstimate: { amount, currency } | null`, optional so historical
  journal rows still parse. Version stays 1: the field is additive and optional.
- **Sent** — `send-requests` passes `shown_estimate` (with the request's cabin) and, at last, `note` to the CRM; the
  e-mail adds one line under the travelers, only when there is an estimate:
  `Indicative estimate shown: $2,055 round trip, business (formula)`. The note is the member's own text, now in the
  e-mail for the first time: it is quoted line by line (`> `) under `Note from the member:`, so no line of it can pass
  for one of the e-mail's own — the action links above all.
- **The convention, written down** — a table created by a named step in `migrate.ts` (`requests.requests` comes from
  `0005_requests.sql`, which runs after drizzle) is changed only by named steps: here
  `0024_requests_shown_estimate.sql` (`ADD COLUMN IF NOT EXISTS`, the CHECK dropped and re-added), recorded in
  `platform.extras_applied`. The drizzle schema declares the same columns, and a no-op migration
  (`20261008191422_snapshot_sync`, `SELECT 1`) brings drizzle's snapshot level, so `drizzle-kit generate` proposes
  nothing — the CI guard of I1. A drizzle `ADD COLUMN` would have run before 0005 on a fresh database and failed.

**Consequences.** A quote's row, its event and the specialist's e-mail carry the same server-computed number; joining
`shown_estimate_amount` with the request's status gives the estimate-to-booking rate. In production no estimate is
stored until the company approves estimates there (`catalog.estimates` off); the note reaches the specialist from the
first deploy. The `requests` module now needs `catalog` (a same-layer port, resolved by the registry like
`engagement → proposals`). Tests: `requests-estimate.test.ts` (stored, published, sent; flag off; rules missing; fares
win; outside North America; fare and alternative requests; first follows the cabin; the note),
`submit-boundaries.test.ts` (a body price is dropped, a replay does not ask), `email-crm.test.ts` (the line and the
quoted note, only when present — a note's line never passes for an action link), `migrate.test.ts` (the ledger), the
drizzle guard.
