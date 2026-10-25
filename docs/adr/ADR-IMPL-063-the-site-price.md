# ADR-IMPL-063 — The site's price: the company's site prices the club's estimates

Status: proposed · Date: 2026-10-25 · Scope: `catalog` (`application/site-prices.ts`, `application/refresh-site-prices.ts`,
`infrastructure/site-prices.repo.ts`, `pricing/estimate-rules.ts`, the search, Home's site pins, `indicativeFor`, the job
`refresh-site-prices`), `packages/shared` (`EstimateVM`, `DestinationPinVM`, `request.submitted`), `packages/db`
(`0038_catalog_site_prices.sql`, `0040_requests_shown_estimate_source.sql`), `requests` (the source recorded and sent),
`crm` (the e-mail line), `scripts/seed-flags.ts`, `infra/cron/crontab`, `infra/RUNBOOK.md` · Amends ADR-IMPL-037 (who
prices an estimate, and the contract that says it) and ADR-IMPL-042 (what a quote records of its estimate, and the
e-mail's line) · Brief 3.1 step 2, decision D6.

**Context.**

- **D6.** Prices are facts: a published catalog fare, then the company's own price, then the formula; each price says
  what it is; a price older than 24 hours is not shown; no number where the company has none — the destination offers
  "Request a quote" instead.
- **The company's price for any route.** The site's own search — the one the public site calls —
  `GET https://webapi.buybusinessclass.com/flights/search?from=&to=&trip_type=round_trip|one_way` answers the company's
  formula with the company's current rules: `{ premium_economy, business, first }`, whole USD per person. Read on
  2026-10-25 (52 read-only requests, the evidence kept outside the repository because it holds company prices):
  200 for any pair with an end in North America — including `JFK → JFK` (the site prices a flight to the same airport);
  404 `{"error":"Offer not found"}` where neither end is (`RMO → LHR`, `IST`, `NRT`); 404 `{"message":"Not found"}` for a
  code the site does not know (`DJT`, `NBJ`, `XXX`); 400 `{"message":"Bad request"}` for any other `trip_type` or none.
  Direction did not change an answer; one way is priced. No rate-limit header, no `Cache-Control`; the host answers as
  `Google Frontend` / `Express`. Three more requests with the club's User-Agent on the day of this change answered the
  same shapes; the first of them took 6.4 s — the host waking from idle — the other two under 0.2 s.
- **Latency** (through the session's proxy, an order of magnitude only): 30 cold calls p50 161 ms, p95 280 ms, max
  363 ms; the site's own part p50 67 ms, p95 94 ms; a reused connection about 55 ms.
- **What the formula gets wrong that the site's price does not** (ADR-IMPL-062): Turkey and the letter Q in the
  reference rules, first class on almost every route (the club hides first on 9 of 28 routes compared, where the site
  shows it), and a number for airports the company does not price (`DJT`, `NBJ`).
- **Where the estimate is asked.** The search (`GET /v1/search`, undated, no fare), Home's site pins (cached a minute),
  and a quote request (`indicativeFor`), which runs inside the submit transaction under an advisory lock on the
  idempotency key (ADR-IMPL-042): it must never wait on a network call.

**Decision.**

1. **The order, per route and cabin** (`application/site-prices.ts`, `resolveIndicative`). A published fare in the cabin
   (the caller's, unchanged) → the site's answer stored less than 24 hours ago → for an undated search only, one live
   call, which stores its answer → the club's formula, only when the site could not be asked (breaker open, timeout,
   5xx, 429, a body not its shape, a refused request) or — for Home's pins and a quote, which never call it — when no
   answer is stored → nothing. **A `none` answer is no number at all**, never the formula: the member gets "Request a
   quote". The guards come first and ask nothing: one airport, two airports of one metro (under 100 km), and a route
   with no end in North America (by the club's continent table, which follows the site's, ADR-IMPL-062) show nothing, as
   before. The cabin rules of ADR-IMPL-037 apply to the site's figures: business when positive; first only when above
   business (a stored answer whose first is not above business shows no first-class number, not the formula's);
   premium economy never. `UNCONFIRMED_COUNTRIES` (empty today) applies to the formula only.
2. **The client** (`sitePriceClient`). The URL above, `User-Agent: BBCClub/1.0 (<APP_ORIGIN>; site prices)`,
   `Accept: application/json`. The body is checked with zod: business a positive whole number, else the answer is
   `invalid`; first and premium economy kept when they are positive whole numbers. A 404 is the company's "none" only in
   one of its two bodies (`no_offer`, `unknown_airport`); any other 404, a non-JSON body or another shape is `invalid`;
   400 `bad_request` (ours — logged as an error with the codes); 429 `rate_limited`; anything else, a failed connection
   or an abort `error`; past its time `timeout`. The search waits **1 s** (2.6 times the slowest cold call seen; a
   cold start of the host takes longer, and then the search shows the formula and stores nothing); the job **10 s**.
   **The breaker**, one per process: five failures in a row open it for 60 s, then one call is let through — its success
   closes it, its failure opens it again. A "none" is an answer, not a failure. A call its caller stopped (the job's time
   up) counts as neither. While it is open the search shows the formula at once: an outage costs the search nothing.
3. **The store** — `catalog.site_prices`, created by the named step `0038_catalog_site_prices.sql` (after 0006 and
   0031: it uses `catalog.fare_trip`), owned by catalog. Key `(route_from, route_to, trip)` — directional; `status`
   `catalog.site_price_status` (`priced` | `none`); `business`, `first`, `premium_economy` whole USD or null;
   `fetched_at`, `expires_at`, `created_at`, all `timestamptz`. CHECKs: a priced row has its business figure and a
   `none` row no figure (`site_prices_status`); figures above zero (`site_prices_amounts`); never one airport
   (`site_prices_route`); and **D6 in Postgres** — `expires_at > fetched_at AND expires_at <= fetched_at + 24 hours`
   (`site_prices_expiry`). Index `site_prices_due (expires_at)`. Every read asks `expires_at > now()`. Written with
   `fetched_at = now()`, `expires_at = now() + 24 hours`, an upsert that replaces the route's row (idempotent). Never
   written for an error: an outage must not freeze "no price" for a day. A drizzle no-op sync migration
   (`20261025132839_snapshot_sync`) brings the snapshot level.
4. **The reads.** The search reads the route's row, else asks once and stores the answer. Home's site pins read their
   candidates' rows in one query and price the rest by the formula — never a call; a city the company has no price for
   gets no pin (no price, no pin, ADR-IMPL-045); their cache key gains `:site` while the flag is on, so turning it on or
   off is seen at once, and the job's answers within the pins' minute. `indicativeFor` reads the route's row, else the
   formula — never a call — so a quote records the number its search showed: the search stored it. The site's figure has
   no rules fingerprint; the formula's keeps it.
5. **The job** `refresh-site-prices` (`application/refresh-site-prices.ts`): every ten minutes, singleton, five minutes
   at most. Which routes, simply and bounded: for every airport the site lists a price from (`catalog.site_routes`, the
   nightly snapshot), its first 36 candidates in the pins' own order (the site's home page first, then the busiest) —
   exactly the pins a member whose home it is can be shown — round trip, the only trip an estimate shows; the guarded
   routes never. Routes with no stored answer first, then those answered 18 hours ago or more, the soonest to expire
   first; at most **150 questions a run, one starting every 500 ms** (about two a second). It stops at the site's first
   429 and when the breaker opens (nothing is asked while it is open); an error stores nothing. Then it deletes the
   expired rows. Its counts go to `platform.job_runs` (`due`, `asked`, `priced`, `none`, `failed`, `rateLimited`,
   `breakerOpen`, `purged`). Run twice, the second run asks nothing and changes no row. Routes searched outside the pins
   are not refreshed: their answer expires and the next search asks again — the set the job keeps is the pins', not
   every route ever searched.
6. **The flag** `catalog.site_prices`, `{ enabled: false }`, seeded off by `scripts/seed-flags.ts`, read under
   `catalog.estimates`, which stays the master switch: with estimates off nothing is read or asked, whatever this flag
   says. With the site's prices off, the search, the pins, the quote and the job behave exactly as before — no row read,
   no question, no `source` in any answer (tested). With them on and no valid rules, the site's answers still show; only
   the fallback is missing (`*_estimates_unavailable{reason}` counts it as before). `pricing/estimate-rules.ts` splits
   "may estimates show, and from what" (`estimateSources`) from "which rules" (`estimateRules`, unchanged).
7. **The contract — Option A** (`packages/shared`, AGENTS rule 9: this ADR). `EstimateVM` keeps its literals —
   `trip: "round_trip"`, `basis: "formula"` — and gains `source?: "site" | "club"` and `asOf?` (ISO, the moment the site
   answered; `site` only), both `.optional().catch(undefined)`. Both sources are the company's formula — the site
   computes it on the company's server with the company's rules — so `basis` stays true. **Option B**, widening `basis`
   to `formula | site`, was rejected: shipped apps parse the search's estimate with `.catch(null)`, so every site price
   would become "Request a quote" on them; under A they show the same number under the same approved words
   ("Indicative · your specialist confirms the fare · round trip"). `DestinationPinVM` gains `priceSource?` (the same
   two values; absent on a fare's pin), and `request.submitted`'s `shownEstimate` gains `source?` (version 1: additive
   and optional). An absent source means the formula: every estimate before this change, and every one while the flag
   is off. The app is not changed: it reads neither field yet.
8. **The request record.** `requests.shown_estimate_source` (`site` | `club`, text with a CHECK: only beside an
   estimate, only those two), added by the named step `0040_requests_shown_estimate_source.sql` — the CHECK `NOT VALID`,
   then validated in its own transaction, as 0029 and 0030. Numbered 0040: a branch in flight beside this one holds
   0039; the numbers only need to be unique and increasing. `send-requests` passes it with the estimate, and the
   specialist's e-mail says which kind the member saw: `Indicative estimate shown: $2,222 round trip, business (company
site)` (a made-up amount), or `(formula)` as before — for the club's formula and for every request without a
   source.
9. **Observability.** `bbc_site_prices_answered{status}` (priced, none: definitive answers, from the search and the
   job), `bbc_site_prices_unavailable{reason}` (breaker, timeout, error, invalid, rate_limited, bad_request),
   `bbc_search_site_prices{source,how}` (how each search with the flag on was priced: `site` stored or asked, `club`
   fallback, `none` none, cabin or guarded), beside `bbc_search_estimates_shown{cabin}`, unchanged. Logs carry codes and
   reasons, never a price: `site price unavailable, the formula stands in`, `site price refused our request (400)`,
   `site prices: the site's rate limit, the run stops`, `site prices: the breaker opened, the run stops`.

**Rejected.** Redis (or a process cache) alone: the quote must read, without a call and inside its transaction, the
number its search showed, and `platform.cache.getOrLoad` loads every time without Redis. A live call from the pins or the
quote: one slow site would hold a Home load, or a quote's lock. Storing errors as "none": an outage would remove every
price for a day. Refreshing every searched route: unbounded; a searched route's answer simply expires. An alias map for
codes the site spells otherwise (`DJT`/`PBI`, `BSZ`/`FRU`, `GNJ`/`KVD`): a separate decision (below).

**Consequences.**

- Nothing changes until an operator turns `catalog.site_prices` on (it is off in every environment, and estimates are
  off in production). Then, where the company prices a route, members see the company's own number — the Turkey, Q and
  first-class drifts of the formula are gone there — with the same words as before.
- **What members see changes when it is turned on** (the owner's call, below): first class appears on routes where the
  club hides it today (the site's first is above its business on every route compared); Cyprus, Russia and Kazakhstan
  show the site's prices; airports the site does not know lose their number (`DJT`, `NBJ`) and show "Request a quote";
  a home outside North America (Chișinău) sees prices only to North America, as D6 says.
- Whenever the site cannot be asked, the formula's drifts come back for that route until the site answers again.
- Volume, per environment: the pins' routes (about 757 deals from the site's US cities, more as airport pairs) refreshed
  every 18 hours — about 1.5–2.5k calls a day, at most 150 every ten minutes — plus one call per searched route without
  a stored answer, a day. Staging and production share one host (ADR-IMPL-010), so the site sees both.
- A quote's estimate costs one more indexed read with the flag on (the route's row); Home's site pins one batched read.

**Left to the owner.**

- **Confirm the call volume with the site's team** (above), and whether they want a key, another User-Agent or a limit
  of their own; the site states none today. The job's budget (`REFRESH_BUDGET`, `REFRESH_GAP_MS`) is one constant each.
- **Turning the flag on changes what members see** (Consequences): first class appears on routes the club hid; CY, RU and
  KZ show the site's prices; airports the site does not know lose their number. Turn it on in staging first
  (`infra/RUNBOOK.md`, "The site's prices").
- Codes the site spells differently from the club (`DJT`/`PBI`, `BSZ`/`FRU`, `GNJ`/`KVD`): with the flag on they show no
  number. An alias map is a separate change if the owner wants those routes priced.
- Whether the app should print who priced an estimate or when (`source`, `asOf` are served; no screen reads them yet).
