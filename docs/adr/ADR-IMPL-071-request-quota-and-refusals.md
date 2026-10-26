# ADR-IMPL-071 — A request's quota never waits on the pool; its refusals say why

Status: proposed · Date: 2026-10-26 · Scope: `packages/modules/platform/src/ratelimit` (`rule()`, `check` with a
resolved rule), `packages/shared/src/module-contract.ts` (`ModulePlatform.rateLimit`), `packages/shared/src/api/v1/requests.ts`
and `errors.ts` (refusal reasons), `packages/modules/domain/requests` (submit), `packages/modules/core/notifications`
(the daily offer cap), `packages/modules/domain/proposals` (ingest replay), `packages/db/scripts/concurrent-indexes.ts` ·
Amends ADR-IMPL-059 point 3 (the quota counted inside the caller's transaction, and a refusal rolled back with it).

**Context.**

- **The quota could stall the API (4.1.2).** `POST /v1/requests` counts its quota inside its transaction, on that
  transaction's connection (ADR-IMPL-059 point 3), under its idempotency lock. But `rateLimit.check` first resolved
  the rule — its defaults, or the flag row `ratelimit.<rule>` — and read that flag on a second pooled connection, with
  no timeout. The flag is cached for 30 s (5 s behind Redis), so this happened only on a cold cache: after a start, and
  again every 30 s. With as many submits at once as the pool has connections, each held one connection and waited for
  another, and none was ever freed: no statement was running, so neither `statement_timeout` nor Postgres' deadlock
  detector could end it. Reproduced on a pool of two: two submits at once never answered.
- **The rate rows themselves.** The October review suspected a deadlock on the GCRA rows. Every submit locks its
  address's row, then its member's, in that order, so concurrent submits from one member on one address queue on the
  first row and never cross. Reproduced with six such submits on a pool of two: with the rule cache warm they answered
  in about 0.1 s (five taken, the sixth refused by the member's limit, `pg_stat_database.deadlocks` 0); with it cold they
  stalled, as above. Same cause, no second one.
- **A refusal cost nothing.** A request refused after its quota was counted (a fare for another trip, an offer that is
  not the member's) rolled the transaction back, and its units with it: the refusal could be repeated for free.
- **A request for a fare that is gone was lost.** Migration 0034 removed duplicate copies of fares; a request queued on
  a phone before it names a fare that no longer exists, was refused, and the app never sends a refused request again.
- **A refusal said only "check the fields".** An app already on phones checks less before it sends, and a request kept
  on the phone ages (a remembered day passes); the answer carried the field and its words but nothing an app could map.
- **Three server faults found beside them.** The daily offer push cap counted the rows created since the server's UTC
  midnight, while quiet hours move a push to the next morning; a CRM retry of an offer stored before the ingest grew
  stricter answered 400, and the at-least-once CRM retried it for ever; a `CONCURRENTLY` index build that failed
  half-way left an INVALID index that `IF NOT EXISTS` then skipped for good.

**Decision.**

1. **A rule is resolved before the transaction.** The limiter gains `rule(name)`, the rule as it applies now (defaults
   overridden by the cached flag row), and `check` takes either a name (resolved first, as before) or a rule `rule()`
   resolved. With `exec` — the caller's transaction — only a resolved rule is accepted: the types refuse a name, and so
   does the code at run time. `POST /v1/requests` resolves its two rules after the committed-replay check and before
   `withTx`, so a replay already answered still reads nothing, and nothing inside the transaction waits for a second
   connection on account of the quota. `ModulePlatform.rateLimit` (`packages/shared`) declares the same two methods.
   The other callers (the `rateLimit` middleware, the operator links) pass a name, outside any transaction.
2. **A refusal after the count keeps its units.** Only a limit's refusal (429) is thrown inside the transaction and
   rolls back, so the member's own limit never drains an address others share. A request refused once its quota was
   counted — a fare for another trip or cabin, an offer that is gone or was never the member's — is answered 400 with
   its field, and the transaction commits with nothing else written: a refused request costs what a sent one does. A
   body that fails `RequestBody` or `SubmittedRequestBody`, a phone that does not parse or a route that cannot be drawn
   is refused before the quota and costs nothing.
3. **A fare that no longer exists is left out, not refused.** When the catalog answers that there is no such fare, the
   request is taken for its trip without `fare_id`, without `price_at_request` (the price was the fare's) and without
   the published price or the airline; the route counts `request_fare_gone` and logs the request id and the fare id
   (`request taken without its fare`). A fare that exists but is another trip's is still refused (point 2); a fare
   read that failed still checks nothing.
4. **Refusals an app can meet carry a stable reason.** `REQUEST_REFUSAL_REASONS` (`packages/shared/src/api/v1/requests.ts`):
   `day_passed`, `same_airport`, `infants_over_adults`, `dates_out_of_order`, `round_trip`, `legs_count`. Each such issue
   carries `params.reason`; `zodFieldErrors` copies it into its line of `error.details` (`reason`, optional in
   `ApiError`), and `POST /v1/requests` answers the first one in `error.context.reason`, with that issue's own words as
   `error.message` (before: `Please check the highlighted fields.`). Additive: the code, the status and the details
   are unchanged, an app that does not know a reason reads it as none and shows the message, and a reason is never
   renamed or reused — a new refusal adds one. The fare and offer refusals of point 2 carry none.
5. **The daily offer push cap counts the day the push is sent, in the member's zone.** A member is capped when another
   offer push of theirs, whatever its status, is scheduled on the local day this one is sent (after quiet hours, not
   before its offer is published), whenever it was created (`daily-cap.ts`, `cappedOnSendDay`; campaign fan-out and the
   personal path both use it). One read per page by `scheduled_for` over a window around the sends, on the partial index
   `notif_offer_sends` (0044, built `CONCURRENTLY`); the day is compared with the Intl data quiet hours use.
6. **A CRM retry of a stored offer replays.** `POST /v1/internal/offers` passes the raw body to `ingest`, which looks the
   `Idempotency-Key` up first: a known key is compared under the looser `IngestReplayInput` (a member id, a media
   address, a route or a currency the stricter `IngestInput` now refuses; the currency compared case-blind) and answers
   the same offer or 409, never 400 for those values. What was never an offer (cabin `economy`) stays 400. A new key
   must still pass `IngestInput`.
7. **The concurrent-index runner recovers an INVALID index.** `applyConcurrentIndexFile`
   (`packages/db/scripts/concurrent-indexes.ts`, used by `migrate.ts` for 0012, 0013, 0017 and 0044) drops an index left
   INVALID by an earlier build (`DROP INDEX CONCURRENTLY`) before it builds it, checks `pg_index.indisvalid` after each
   build, and records the file in `platform.extras_applied` only when every index in it is valid; a build that fails
   records nothing, and the next migrate tries again.

**Consequences.**

- At pool-size concurrency on a cold cache, submits answer; each waits only for a free connection to read its rule,
  holding none.
- A flag changed by an operator still applies within the cache's 30 s; a rule resolved just before the transaction is
  at most that transaction's age older.
- Still inside the transaction, as ADR-IMPL-059 accepted: the fare, the offer and the estimate a request names are read
  on pooled connections, each bounded by its own 1 s timeout (`askWithin`) and never fatal. With the pool saturated, a
  request waits at most that long for each and records less. Moving them before the transaction would cost a catalog
  read for every rate-limited request, which the module chose not to pay (`submit-boundaries.test.ts`).
- A member who meets five refusals in the window is then 429 like one who sent five requests; a refusal no longer
  probes fares or offers for free.
- A request taken without its fare reaches the specialist as a trip with no fare and no price; the member sees no price
  on it.
- A newer app can say why a request was refused and open the field; an older one shows the refusal's own words instead
  of `Please check the highlighted fields.`
- Two offer pushes no longer land on one local evening across UTC midnight, and a push sent today is no longer dropped
  for one created today but sent tomorrow.
- An offer stored before the ingest grew stricter keeps its retries answered; its row is not repaired.
- A migrate stopped half-way through a `CONCURRENTLY` build is finished by the next migrate instead of leaving the index
  unusable.

**Left to the owner (not decided here).**

- Whether `requests.submit` needs a higher limit now that refusals count (the flag `ratelimit.requests.submit`).
- Whether the fare and offer refusals of point 2 get reasons of their own, and the words an app shows for each reason —
  a contract and copy decision.
- Whether a request taken without its fare tells the member so.
- Whether the offers stored before the ingest grew stricter are repaired, after which `IngestReplayInput` can go.
- `0044_notifications_offer_send_day.sql` names the runner by its old name (`applyConcurrentIndexes`); an existing
  migration is not edited without an ADR (AGENTS.md rule 9).

**In the app, to follow.**

- Map `error.context.reason` (and `error.details[].reason`) to the app's own words and the field to open
  (`apps/mobile/src/lib/api.ts` reads only the message today); a reason the app does not know reads as none.
- An app already on phones knows no reason: it shows `error.message`, now the refusal's own words, and a request it
  queued offline that is refused is still dropped — only a fare that no longer exists is now taken instead.

**Tests.** `apps/api/test/requests-rate.test.ts` ("on a full pool": a pool of two, two submits at once on a cold cache;
six from one member on one address); `packages/modules/platform/tests/ratelimit-pg.test.ts` (a pool of one: a rule
resolved before the transaction is counted inside it with no flag read; a name with a transaction is refused);
`apps/api/test/requests-rate.test.ts` (after five refusals the member's next request is 429);
`apps/api/test/requests.test.ts` (a fare that no longer exists is left out; a refusal says why, in its message and its
reason); `campaign-fanout.test.ts` and `on-offer-published.test.ts` (around UTC midnight, across quiet hours, an offer
published for later); `ingest-validation.contract.test.ts` (a retry of a pre-strictness offer replays or is a 409,
never a 400); `packages/db/test/migrate-concurrent-index.test.ts` (an INVALID index dropped and rebuilt; a failed build
records nothing).
