# ADR-IMPL-042 — The quote request carries the estimate its search showed

Status: accepted · Date: 2026-10-08

**Context.** Since ADR-IMPL-037 an undated search with no published fare in the chosen cabin shows the company's
indicative price (`From $2,055 · round trip`). The member then asks for a quote, and the specialist who calls back did
not know which number the member had seen — the e-mail carried the route, the dates and the travelers only. The company
wants to measure how often an estimate turns into a booking. Approved with P1 on 7 Oct 2026 (sections 9–11 of the P1
debate); split from P1a so the search could ship first.

Two defects on the same path, found while building it: the member's note never reached the specialist (`claimUnsent`
did not select it, so the e-mail's note was always empty — and the note is where the app asks members to put
their children's ages), and every round-trip request read `JFK → JFK` (the second section below).

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

## Requests read back their destination

**Context.** The route of a request was built as `first leg's origin → last leg's destination` in five places (the
member view, the event, the status change, the operator page, the quote-ready push). For a round trip the last leg comes
home: every round trip read `JFK → JFK` — in the Requests list, the request detail, the push ("JFK → JFK — tap to call
your specialist") and the operator's confirmation page. Figma (233:4069, 233:4171) titles a request with the destination
city, `London`, over `JFK → LHR · BUSINESS`.

**Decision.** One function, `requestRoute(legs, tripType)` in `application/route.ts`: the outbound leg for a round
trip and one way (`JFK → LHR`); for a multi-city trip, origin to its last stop before coming home. Every place that
wrote a route uses it. `RequestVM` gains `city: string | null`, optional — the destination's city from the catalog's
airports, read in one batch per page (`getAirports`), null when the airport is unknown or the read fails (logged; the
answer still goes out, so a created request never comes back as a 500); an older app ignores it, a newer app falls back
to the route when it is absent. For the detail (Figma 233:4171, 233:4242) it also gains `tripType` (the facts line's
`ROUND TRIP`) and `phone` — the number the specialist calls, the request's own contact phone, which only its member
reads (ownership is in the `WHERE`). Both optional, like `city`; a trip type an app does not know reads as none
(`.catch`), so the request still lists. `dates` names one month once (`Oct 12–19`, as the frames do; `Oct 30–Nov 6`
across months). And a request the server holds but has not passed on yet reads `received` to its member — the job
passes it on within the minute, and Figma's just-received frame (233:4639, "Your request is with us.") is that moment;
it read `not_sent` until then, so every new request was briefly "not sent" with a nudge to try again. It reads
`not_sent` only once the job has given up (six attempts). Contract change in `packages/shared` under this ADR.

**Consequences.** Requests, the detail, the push and the operator page name the destination. Journal rows written before
this change keep their old `route` text; only new events carry the corrected one. The app's title uses `city` in its
next release (A2c). Tests: `request-route.test.ts` (round, one way, multi-city ending at home, empty),
`requests-route.test.ts` (the created request, the list, the detail, the operator page, both events; one way; an
unknown airport has no city; the trip type and the phone; an app built before them still parses the answer),
`request-route.test.ts` (one batched read; a failed read answers no cities and is reported, never thrown),
`requests.test.ts` (a new request reads `received`; `not_sent` once the job gives up), `query-budget.test.ts` (list
and detail within budget).
