# ADR-IMPL-059 — The harness fix batch: stricter contracts, one fare per trip, a request that can be flown

Status: accepted · Date: 2026-10-22 · Scope: P1 (`packages/shared`: `api/v1/proposals.ts`, `api/v1/requests.ts`,
`time-zone.ts`, `module-contract.ts`; `packages/modules/platform/src/ratelimit`; migrations 0034–0036 and their named
steps in `packages/db/scripts/migrate.ts`; identity's auth routes and facade; catalog, members, requests, notifications;
`packages/ui` hit slop and `./flight-facts`) · Amends ADR-IMPL-040 and ADR-IMPL-041 (their own amendment notes); the
platform and host half of the same batch is ADR-IMPL-058.

**Context.** The app and every API route were walked on two harness stacks (October 2026: a web build of the app on
a real API and Postgres, one stack in test mode and one in production mode with a fake Postmark). The walk found 114
problems; 112 were triaged and fixed in eight groups, each reviewed on its own branch and merged here. Most changes
stay inside a module. This ADR records the ones AGENTS.md rule 9 reserves for a decision, and the behaviour a client
or an operator will notice.

**Decision.**

1. **Contracts refuse what Postgres would refuse (`packages/shared`).** A body the database cannot store answered 500;
   it now answers 400 with the field named.
   - Text a column keeps (`displayName`, travel notes, device fields) refuses U+0000 and an unpaired UTF-16 surrogate
     ("That text has a character we can't keep."). The check is a loop, so it runs on Hermes too.
   - `ProfilePatchBody`: `displayName` is trimmed and never blank. `homeAirport` is three letters, upper-cased.
     `timezone` must be an IANA zone Intl can read (`isIanaZone`, new `time-zone.ts`): one bad zone stopped every
     broadcast campaign at quiet hours. `phone` is stored in E.164 (default country US), so a saved phone always
     passes `RequestBody.contact.phone`; an extension is dropped.
   - `TravelPreferencesBody`: destinations are IATA codes, upper-cased, deduplicated in the order sent; no more
     infants than adults. It is now a `ZodEffects` and has no `.shape`.
   - `DeviceBody`: a push token is printable ASCII up to 1 024 characters, so it always fits the UNIQUE index's row;
     `expoToken` and `appVersion` are bounded too.
   - `PasswordBody`: `PASSWORD_RULE` / `PASSWORD_RULE_MESSAGE` (one number or symbol) are exported here and are the
     only copy: `POST /v1/account/password` and identity's Better Auth reset route both use them.
2. **A request that can be flown (`api/v1/requests.ts`).** `RequestBody` refuses a trip that cannot exist: a round trip
   that does not come back the way it went, the wrong number of legs for its type, a leg that ends where it starts, a
   leg before the one before it, more infants than adults, NUL in the contact or note. Each issue carries its path.
   `SubmittedRequestBody` (the server's parse) also refuses a leg before `earliestLegDay()` (yesterday in UTC). The
   day rule is not in `RequestBody`, because the app's offline queue parses stored requests with it, and a request
   must stay readable after its day so the server can refuse it.
3. **A rate-limit unit counted inside the caller's transaction (`module-contract.ts`, platform).**
   `platform.rateLimit.check(rule, subject, exec?)`. With the postgres store, the GCRA row is updated on `exec`, so a
   request refused or rolled back spends nothing. `POST /v1/requests` counts its quota this way, under its
   idempotency lock, so two sends of one key spend one unit. The memory and redis stores ignore `exec`. A 429 from
   `POST /v1/requests` carries `error.context.scope` (`"ip"` or `"member"`).
4. **One fare per route, cabin, carrier, valid_from and trip (0034).** The fares key gains `trip` and is
   `UNIQUE NULLS NOT DISTINCT`, so a fare without a carrier is one fare. Before this, three imports of one file made
   three rows, and one route sold one way and round trip overwrote itself in place. The migration keeps the most
   recently updated copy of each duplicate and deletes the others. Requests keep their own copy of the price (0029,
   0030). Seeds and the import target the new key.
5. **Catalogue CHECKs (0035).** `fares_duration_pos` (a duration is positive or NULL; stored zero or negative
   durations become NULL) and `airports_coordinates` (on the globe). Both are added `NOT VALID` and validated in a
   second transaction.
6. **A broadcast offer published for later is pushed then (0036).** `notifications.campaigns.not_before`: the
   fan-out job does not claim a campaign before its offer's publish time.
7. **Request status moves forward only.** `POST /v1/internal/requests/:id/status` refuses a step back
   (`booked → quoted`) or a move out of `closed` with 409 CONFLICT `{ from, to }`, and writes nothing. A
   `GET /v1/requests/:id` whose id is not a UUID is 404, never a cast error.
8. **Identity.**
   - New answers the app maps: 503 `EMAIL_UNDELIVERABLE` (with `reason`) when a sign-in code could not be sent;
     400 `PASSWORD_TOO_WEAK` and 503 `PASSWORD_CHECK_UNAVAILABLE` on the reset route, where the code stays usable;
     503 `SERVICE_DISABLED` on `POST /v1/account/password` when the breach list cannot be reached.
   - `/sign-up/email` and `/expo-authorization-proxy` are disabled.
   - Deleting an account needs the password: `deleteAccount(headers, password)`.
   - Codes: one send at a time per address; a reset-code answer takes at least `POSTMARK_TIMEOUT_MS` (4 s), whether
     or not the address is a member's.
   - Writes read the session fresh (`getSession(headers, { fresh: true })`): a revoked session can no longer write
     while its cookie cache lasts.
   - New facade method `registeredEmail(memberId)`.
9. **Members create the profile they are asked about.** `MembersFacade.ensureProfile` creates a missing profile on
   first use. `member.linked_to_crm` is published from the stored row, so the event and the row always agree.
10. **An unreadable price-rules row is not a missing one (`module-contract.ts`, catalog).** The flags port gains
    `readStrict(key)`, platform's `read` without its fallback (ADR-IMPL-058). Catalog reads `catalog.pricing_rules`
    with it, so a database or Redis failure counts `bbc_*_estimates_unavailable{reason="error"}` and logs
    `pricing rules unreadable`. Before, it counted `missing`, and the runbook's answer to `missing` is to load the
    rules again.
11. **`packages/ui`.**
    - New subpath `./flight-facts`, pure, so app logic can be tested under bun without React Native.
    - `MIN_TARGET` / `hitSlopFor` / `buttonHitSlop`: a Button reaches 44 pt by default. All new props are optional.

**Consequences.**

- A client that sent junk now gets 400 where it got 500 or a stored bad value. The app checks the same contracts
  before it sends.
- Rolling deploy: once 0034 has run, an old API replica's catalogue import targets a key that no longer exists, and
  fails until the new image serves. Do not import during a deploy.
- 0035's validation stops the migration if a stored airport is off the globe. Re-import it first; the reference data
  has none.
- Re-importing a fare with a corrected trip no longer replaces the old row. The old trip's fare stays on sale until
  its `valid_until`, unless an operator ends it.
- `POST /v1/requests` reads catalog and proposals inside its transaction, under the GCRA row locks. With the pool
  saturated (about 10 concurrent submits), those reads hit their 1 s timeout, and the request goes through without
  an estimate, as ADR-IMPL-042 allows (fail-open).
- A past or far-future `when` on `/v1/search` answers 200 with an empty list, not 400, because recent searches resend
  their remembered dates (ADR-IMPL-041 amendment).
- A member who joined by code and never set a password must set one ("Forgot password?") before deleting their
  account. The app says so (`CREDENTIAL_ACCOUNT_NOT_FOUND`), and a request saved because the club did not answer is
  no longer worded "offline" (F110).
- The deep-link handler: an unknown `bbcclub://` link while the app is running brings the app forward and navigates
  nowhere; at launch it opens `/`.

**Left to the owner (not decided here).**

- Estimates for more countries. Almaty shows no price because Kazakhstan is one of the countries the formula refuses
  until one route there is checked against the company's site (ADR-IMPL-037: AM, AZ, CY, GE, GL, KZ, RU). The app
  cannot tell a member why a city has no estimate. It infers "outside North America" from three country codes (US,
  CA, MX), while the formula's North America also takes Puerto Rico, the Caribbean and Central America. A reason sent
  with the search (`noEstimate`) and its copy are a contract and copy decision.
- Offers to regions with no Home section (Oceania, Africa, South America, the Caribbean) appear only among the six
  newest. A new section is a product and design decision.
- Home shows broadcast offers that leave from another city without saying so (ADR-IMPL-057 "Not in this ADR").
- DESIGN.md conflicts, reported, not resolved:
  - `text-muted` (#768095, 3.97:1) carries words, against the 4.5:1 rule.
  - A disabled button dims to 0.45 in `packages/ui`; DESIGN.md says 0.5.
  - A pressed card dims to 90% in `OfferCard`; DESIGN.md 3.0 says 85%.
  - Profile's row cards sit at a 29.65 pt pitch, under 44 pt.
  - Sign out is drawn 16 pt under Delete account, not 7.6, so the two targets do not overlap.
- Store listing URLs for the forced-update page; the Mapbox token on the preview build; `@rnmapbox/maps` 10.3.8
  (a native build).

**Not in this ADR.** `/api/auth/*` has no body limit of its own (Bun's default applies). The tests that submit a
request send days relative to today (the month after next), since the server refuses a day already over.
