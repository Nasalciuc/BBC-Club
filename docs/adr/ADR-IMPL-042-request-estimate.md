# ADR-IMPL-042 — The quote request carries the estimate its search showed

Status: accepted · Date: 2026-10-08 · Amended the same day after a review of about 560 hypotheses (the third commit)

**Context.** Since ADR-IMPL-037 an undated search with no published fare in the chosen cabin shows the company's
indicative price (`From $2,055 · round trip`). The member then asks for a quote, and the specialist who calls back did
not know which number the member had seen — the e-mail carried the route, the dates and the travelers only. The company
wants to measure how often an estimate turns into a booking. Approved with P1 on 7 Oct 2026 (sections 9–11 of the P1
debate); split from P1a so the search could ship first.

Two defects on the same path, found while building it: the member's note never reached the specialist (`claimUnsent`
did not select it, so the e-mail's note was always empty — and the note is where the app asks members to put
their children's ages), and every round-trip request read `JFK → JFK` (the second section below).

**Decision.**

- **Only what the member saw, recomputed, never received** — the app says whether it showed the indicative fare before
  the member asked: `RequestBody.estimateShown`, a yes and never a number. At `POST /v1/requests`, a request whose
  effective intent is `quote` (no `fareId`, no `offerId`, not an `alternative`) and whose app said yes asks the
  catalog, through its facade, for the estimate an undated search shows for its outbound leg and cabin:
  `CatalogFacade.indicativeFor`. It shares the flag, the rules and the formula with the search, and applies the same
  fare rule (no published fare in that cabin), so the specialist sees the member's number. Without the yes — an app
  older than the estimate row, a dated search (it shows no estimate, ADR-IMPL-037), an offer card without a fare — no
  estimate is asked for, so an e-mail never claims one the member did not see. A price sent with the body is not in
  `RequestBody` and is dropped by the parse.
- **Asked at the right moment, never deciding** — after the idempotency and rate-limit checks (a replay or a refused
  request never asks) and before the transaction. The cached flag rows come first: with estimates off (production today)
  or no valid rules there is no catalog read; with them on, one batched airport read and one fare read
  (`query-budget.test.ts`). An estimate never decides whether a request is accepted: an error, an answer slower than
  one second, or an amount that is not a positive whole number gives none, counted by reason
  (`bbc_request_estimates_unavailable{reason="error"|"timeout"|"invalid"}`; the catalog adds `missing` and `invalid`
  rules) and logged (`request estimate unavailable`) — `application/estimate.ts`.
- **Recomputed when the request arrives** — so a flag switched off, rules reloaded or a fare published between the
  search and the request give a different number or none; a request queued offline gets the estimate of the moment it
  arrives. The estimate is the formula's only trip, a round trip for the outbound route: a member who then asks for a
  one-way or multi-city trip still saw that round-trip number, and the e-mail says so next to the trip line. An app
  that lets the member change the route or the cabin in the request sheet stops saying yes (A2c).
- **Stored** — `requests.shown_estimate_amount` (integer, whole US dollars) and `shown_estimate_currency` (`USD`), both
  or neither (`requests_shown_estimate` CHECK). 0024's CHECK let half a pair in — a CHECK passes when its expression is
  NULL, so `amount > 0 AND currency = 'USD'` alone accepted `(NULL, 'USD')` and `(2055, NULL)`; 0025 replaces it with one
  where each side says `IS NOT NULL`. Null on every other request — no yes from the app, a fare, an offer or an
  alternative, estimates off, rules missing or invalid, a published fare in that cabin, an airport the catalog does not
  know, or an answer that failed, came late or was not a positive whole number. Counted once the row exists:
  `bbc_request_estimates_stored{cabin}` (a replay or a lost race stores nothing new).
- **Published** — `request.submitted` gains `shownEstimate: { amount, currency, rules? } | null`, optional so historical
  journal rows still parse; `rules` is the fingerprint of the rules that computed the number (16 hex — it identifies
  them, it never reveals them, ADR-IMPL-037). Version stays 1: the fields are additive and optional.
- **Sent** — `send-requests` passes `shown_estimate` (with the request's cabin) and, at last, `note` to the CRM; the
  e-mail adds one line under the travelers, only when there is an estimate:
  `Indicative estimate shown: $2,055 round trip, business (formula)` (the approved wording). The note is the member's
  own text, now in the e-mail for the first time: it is quoted line by line (`> `) under `Note from the member:`,
  splitting at every break a mail client may honour (CR, LF, VT, FF, NEL, U+2028, U+2029), without the control and
  bidirectional characters that could hide text or move a `> `, and folded at 76 characters between whole characters
  (an emoji sequence, a letter and its accent are never split) — no line of it can pass for one of the e-mail's own,
  the action links above all. A note of spaces is no note. The member's name, the other text the member types, is
  printed on one line whatever was sent (`Member: …`), for the same reason. The log redacts `note` at the top of a log
  object and two levels down (`logger-redact.test.ts`).
- **The convention, written down** — a table created by a named step in `migrate.ts` (`requests.requests` comes from
  `0005_requests.sql`, which runs after drizzle) is changed only by named steps: here
  `0024_requests_shown_estimate.sql` (`ADD COLUMN IF NOT EXISTS`, the CHECK dropped and re-added) and
  `0025_requests_estimate_pair_and_list.sql` (the CHECK above, the list's index), each recorded in
  `platform.extras_applied`. A correction is a new step, never an edit of one: the ledger records a step's name, not
  its content, so an edited step would never run again wherever it already ran. The two run together: deleting 0024's
  ledger row alone would run it again after 0025 and put its weaker CHECK back (infra/RUNBOOK.md). The drizzle schema declares the same
  columns, CHECK and indexes, and no-op migrations (`20261008191422_snapshot_sync`, `20261008214247_snapshot_sync`,
  `SELECT 1`) bring drizzle's snapshot level, so `drizzle-kit generate` proposes nothing — the CI guard of I1. A drizzle
  `ADD COLUMN` would have run before 0005 on a fresh database and failed. (The note in `0021_requests_intent.sql` about
  `schemaFilter` predates I1: `drizzle-kit generate` ignores it, and the snapshot holds the requests tables.)
  `schema-parity.test.ts` now compares CHECK constraints by name, both ways, and an index's key positions even when one
  is an expression — not an expression's text, a key's direction or a CHECK's body: `migrate.test.ts` tests what this
  CHECK refuses and `hot-queries.test.ts` that the list reads its index without a sort.

**Known limits, and what is the owner's to decide.**

- The line reads `$2,055 round trip, business` — the approved wording — and the estimate is for one traveler: under
  `2 adult(s), 1 child(ren)` a specialist could take it for the party's total. Adding `per traveler` changes approved
  words, so it is the owner's decision.
- A note line that starts with a right-to-left letter (Arabic, Hebrew) may be shown right to left by a mail client,
  its `> ` at the far end, and a phone may still wrap a quoted line of 76 characters, which a client that does not
  style quotes shows without its `> `. Specialists act only on the links under `When you have acted on it, mark it`,
  which no note can reach.

**Consequences.** A quote's row, its event and the specialist's e-mail carry the same server-computed number. The
estimate-to-booking rate counts a request as booked when its timeline ever reached `booked` (a booked request may be
closed later, or closed by an account deletion), against quotes without an estimate, over requests old enough to have
ended. In production no estimate is stored until the company approves estimates there (`catalog.estimates` off), and
none until the app that says `estimateShown` (A2c) is out. The note and the estimate reach a specialist only with
`CRM_ADAPTER=email` — the one adapter that writes to a person today (`mock` writes nothing; `http` is not built and stops
the API at boot, so `infra/env/production.env.example` now says `email`) — from the first deploy; requests made during the deploy, until step 6/8 recreates the worker, are
still e-mailed by the previous one, without them. A killed catalog still answers its facade: `catalog.estimates` off is
the switch for estimates. The `requests` module now needs `catalog` (a same-layer port, resolved by the registry like
`engagement → proposals`). Tests: `requests-estimate.test.ts` (stored, published with the fingerprint, sent; no yes, no
estimate; flag off; rules missing; a failing catalog gives none and the request still goes through; fares win; outside
North America; fare and alternative requests; first follows the cabin; the note), `submit-boundaries.test.ts` (a body
price is dropped, a replay and a rate-limited request do not ask, no yes does not ask), `estimate.test.ts` (error,
timeout, invalid amount), `email-crm.test.ts` (the line, the quoted note, every line break, invisible characters,
folding — an emoji, a family of joined emoji and an accent at the fold —, a blank note, the name on one line),
`logger-redact.test.ts`, `migrate.test.ts` (the ledger, and the CHECK refusing each half of a pair),
`schema-parity.test.ts`, `query-budget.test.ts` (no fare read with estimates off), the drizzle guard.

## Requests read back their destination

**Context.** The route of a request was built as `first leg's origin → last leg's destination` in four places — the
member view, `request.submitted`, `request.status_changed` (which the quote-ready push reads) and the operator page. For
a round trip the last leg comes home: every round trip read `JFK → JFK` — in the Requests list, the request detail, the
push ("JFK → JFK — tap to call your specialist") and the operator's confirmation page. Figma (233:4069, 233:4171) titles
a request with the destination city, `London`, over `JFK → LHR · BUSINESS`.

**Decision.**

- **One reading, shared** — `packages/shared/src/requests/display.ts`: `requestRoute(legs, tripType)` is the outbound
  leg for a round trip and one way (`JFK → LHR`); for a multi-city trip, origin to its last stop before coming home.
  `requestDates(legs)` writes `Oct 12–19` within a month, `Oct 30–Nov 6` across months, `Nov 3` for one day — a one-way
  trip or a same-day return — from the earliest leg to the latest, leaving out a date that is not a real day. Every place
  on the server that wrote a route uses `requestRoute`; the app imports the same functions from A2c on (until then it
  builds a waiting request's route itself), so the two cannot drift.
  `RequestLeg` now refuses a code that is not three letters and a date that is not on the calendar (`2027-02-29`).
- **What the screens show** — `RequestVM` gains `city: string | null`, optional — the destination's city from the
  catalog's airports, read in one batch per page (`getAirports`), null when the airport is unknown or the read fails
  (counted, `bbc_request_cities_unavailable`, and logged; the answer still goes out, so a created request never comes
  back as a 500); an older app ignores it, a newer app falls back to the route when it is absent. For the detail (Figma
  233:4171, 233:4242) it also gains `tripType` (the facts line's `ROUND TRIP`) and `phone` — the number the specialist
  calls, the request's own contact phone, which only its member reads (ownership is in the `WHERE`). All three are
  optional and read as none when an app cannot read them (`.catch`), and a state an app does not know reads as
  `received` — a request stays on the list instead of vanishing from it. The list puts requests in progress first, so
  an older one never drops off a page of 50 behind finished ones; `requests_member_list` (0025) holds that order, so the
  list still reads 51 index entries however many requests a member has (`hot-queries.test.ts`: the index, no sort;
  `list-and-send.test.ts`: the order). An app's Profile that shows the first three of the list as "Recent requests"
  (0.2.0) now shows requests in progress first; the A2c app sorts them by date.
- **The state a member reads** — a state the CRM or an operator set wins, even if our own send has not been recorded.
  A request the server holds but has not passed on yet reads `received` — Figma's just-received frame (233:4639, "Your
  request is with us.") is that moment; it read `not_sent` until then, so every new request was briefly "not sent" with
  a nudge to try again. The job passes it on at its next run (each minute); when the CRM fails it tries again every five
  minutes, six times (about 30 minutes, `MAX_SEND_ATTEMPTS`). A request reads `not_sent` once the job has given up, or
  once it has waited 45 minutes for any reason (the worker may be down). Giving up is logged as an error, counted
  (`bbc_request_sends_given_up`) and posted to `OPS_WEBHOOK`; an operator re-queues the request (infra/RUNBOOK.md,
  "A request that was never sent") — nothing resends it by itself. A stopped worker alerts no one: every `OPS_WEBHOOK`
  post comes from the worker itself, so an outside check on its `/ready` (an uptime monitor) is the owner's to set up.
  The 45 minutes stay longer than the job's six tries could take (`request-route.test.ts`). The app asks the member to call from A2c on; older
  apps still say a not-sent request is saved on the phone. A row the job cannot read counts as a failed attempt
  instead of stopping the batch; a closed row (an account deleted) is not sent (`list-and-send.test.ts`).
- Contract changes in `packages/shared` (`RequestBody.estimateShown`, `RequestLeg`, `RequestVM`, `request.submitted`,
  `requests/display.ts`) and `packages/modules/platform` (the log redacts `note`; `createLogger` takes a destination, for
  a test that reads a line) under this ADR.

**Known limits, left as they are.** A multi-city trip that ends at another airport of the home city (`… CDG → EWR` from
JFK) is titled with that airport's city. A request whose legs say `JFK → JFK`, whose leg count does not match its
trip type, or whose dates are out of order, is still accepted (its dates read from the earliest to the latest):
refusing it would drop requests already queued by apps in the field (a 400 removes a queued request). CRM status
webhooks arriving out of order can move a state back (`quoted` → `assigned`); that predates this change, and whether to
order them by the CRM's time or refuse a step back is the owner's decision.

**Consequences.** Requests, the detail, the push and the operator page name the destination. Journal rows written before
this change keep their old `route` text; only new events carry the corrected one. The app's title uses `city` in its
next release (A2c), which must be published only after this API is deployed in that environment. Tests:
`request-route.test.ts` (round, one way, multi-city ending at home, empty; the dates — same day, across months, a year
apart, out of order, not a day; the member's state — received, gave up, waited too long (longer than the job's
tries), an operator's state wins; one
batched city read, a failed read answers none and is reported), `requests-route.test.ts` (the created request, the
list, the detail, the operator page, both events; one way; an unknown airport has no city; the trip type and the phone;
an app built before them still parses the answer), `requests.test.ts` (a new request reads `received`; `not_sent` once
the job gives up), `on-member-deleted.test.ts` (the note is redacted, a closed row is not sent), `query-budget.test.ts`
(list and detail within budget; more requests, not more queries), `hot-queries.test.ts` (the list reads its index;
the send claim reads `requests_unsent`).
