# ADR-IMPL-075 — Reference data held in each process, current within a second; one gate per route; Home's fast 304

Status: proposed · Date: 2026-10-26 · Scope: `packages/modules/platform` (`generations/`, `flags/`, `ratelimit/gate.ts`,
the facade's `reference`), `packages/shared` (`module-contract.ts`: `reference`; `authz/authorize.ts`: `modules`;
`time-zone.ts`; `api/v1/fares.ts`), migrations `0045_platform_generations.sql`, `0046_catalog_generations.sql`,
`0047_proposals_generations.sql`, the catalog (`airports-reference.ts`, `discovery.ts`, the module's memos), proposals
(`verdict`), requests (`askOffer`), notifications (quiet hours, the daily cap), the api host (the BFF, `app-config.ts`,
`http-cache.ts`), every module's route block, `infra/caddy/Caddyfile` · Amends ADR-IMPL-029 (Decision 5: kill switches
and consumer pauses are no longer read from Postgres on every request) and ADR-IMPL-036 ("cached 60 s" is now true
without Redis).

**Context.** Redis is off in production (`redis-kafka` profile), and without it `platform.cache` only loaded: no cache
existed. Per request, measured on `main` faf33dd:

- The kill flag was read from Postgres on nearly every request (ADR-IMPL-029 §5); app-config read six, one after the
  other. Ordinary flags had a 30 s cache per process, and `set()`'s invalidation reached only the process that wrote — an
  operator writes with psql, so the replicas could disagree for 30 s.
- The airports (3 900 rows, changed by a deploy or an import) were read on the hottest routes; the typeahead ran
  ADR-IMPL-036's query at every key; "Popular from" sorted every airport (3.15 ms).
- `invalidateMaps()` emptied only the process that wrote: for expire-fares and the site's sync that is the worker,
  where nothing reads. The API replicas kept old pins up to a minute.
- A route was declared three times (`registerRoute`, `rateLimit`, `authorize`), matched by strings, in two orders; "is
  the module killed?" lived in five places with three lists of modules; Home was stopped by catalog's kill alone though
  it answers with members' and proposals' data.
- Home made five rounds of reads, read `engagement.offer_responses` — which nothing in production writes — on every
  request, and serialised its body twice (once for the ETag). A 304 saved only bytes.
- "Expired, but it was mine" was decided twice with different rules (the offer's page; a request made from an offer).
- A fare's local clocks built an `Intl.DateTimeFormat` per call: 13 % of the route.

**Decision.**

1. **Generations.** `platform.generations(key, value)`, one row per reference table. `platform.bump_generation(k)` is
   platform's SQL API; a statement-level trigger (`platform.bump_generation_trigger`) on each reference table bumps it
   in the statement that writes — the app, a job and psql alike: `platform.flags`; `catalog.airports`; `catalog.fares`;
   the site's places and routes (`catalog.site`); the offers and their targets (`proposals.offers`). The site's stored
   prices have no trigger: a member's search stores one, and a bump per search would empty every replica's pins all day.
2. **Each process reads the counters at most once a second on its own** (`createGenerations`: one small query, shared
   by every caller of that moment, given up after 500 ms). `invalidate()` makes the next read immediate, for the process
   that just wrote, so a process that writes reference tables may read them more often. A failed or slow read keeps the
   last counters until a read succeeds (Postgres is asked again a second later); `staleMs()` says how old they are.
3. **Snapshots and memos** (`platform.reference.snapshot`, `.memo`): a whole table, or results keyed by request, kept
   until a named generation moves, with an optional age bound for what changes with the clock and a cap on entries.
   While Postgres is away a snapshot serves what it holds. Hits and misses are counted (`cache_hit`/`cache_miss` by
   `ns`, the dashboard's hit ratio).
4. **Flags from one snapshot** of `platform.flags`: no query between counter reads; a psql write reaches every replica
   within a second. An ordinary flag that cannot be read falls back to its default; **a kill or pause flag fails closed**
   (killed, paused) when it cannot be read or the counters are older than `KILL_STALE_MS` (10 s). `killState` keeps
   boot's rule: it throws rather than call an unreadable flag killed.
5. **Airports in memory** (`createAirportsReference`): by code, many in the order asked, the hubs, a zone's busiest; the
   typeahead keeps ADR-IMPL-036's query and answers each typed text (trimmed, lower case) once per generation, at most
   5 000 texts per process. The pins, the site's pins and deals, the bookable set and "Popular from" are memos on their
   tables' generations (60 s, or 300 s for Popular, which counts searches). A caller's transaction still reads the table.
   `(popularity DESC, code)` is an index for whoever sorts in SQL.
6. **One gate per route** (`routeGate(platform, owner).on(routes, "/v1")`): the path once, then
   `{ permission, rate, rateBy, reads }`. Every route is checked in one order — the rate rule, the permission, the kill
   flags of the owner and of every module it `reads` — and the inventory registry is written from the same declaration.
   `rateBy: "route"` registers a rule a later step counts (a password change, a photo, under subjects of their own).
   Home reads `members` and `proposals`: a kill of either stops it. App-config's kill switches are every module the
   process runs (the registry's list), read from the snapshot: no query.
7. **Home's and the feed's fast 304.** The ETag stays the hash of the body as sent (serialised once). Beside it each
   process remembers, per member, the versions the body came from — the member's home and cabin, the generations of the
   tables the body reads, and the minute — and answers a phone holding that body 304 before any of the body's reads.
   What moves with time alone (an offer's publish or expiry, a fare's day, a stored site price) moves the minute. The
   member's responses to offers are not among the versions: the body shows none (8).
8. **⚑7a: no response is read.** Home, the feed and an offer's page show `unseen`: nothing writes
   `engagement.offer_responses` in production. The read comes back with the feature that writes it.
9. **Proposals owns the offer's verdict** (`verdict`: `visible`, `gone`, `not_yours`, `missing`), one read: an offer
   gone (withdrawn, expired, past its validity) answers 410 when it was the member's — everyone's, theirs or their
   segment's — and lets a request made from it through; someone else's or not yet published is a 404. The offer's page
   and `askOffer` read the same answer (before: the page refused a segment's and an active one past its validity; a
   request let anyone's segment offer through).
10. **One time-zone module** (`@bbc/shared/time-zone`): `isIanaZone` — a name, never an offset — is the import's, the
    fares', quiet hours' and the profile's rule; `zoneClock` keeps one formatter per zone.
11. **Caddy compresses nothing**: Cloudflare compresses towards the phone; Caddy's CPU is watched on the box's
    dashboard before and after.

**Consequences.**

- Statements per request, measured through PgBouncer with the token alone (`load/bench/perf.ts`): Home 7 → 2 (the
  profile, the feed; the counters once a second), 1 on a fast 304; the feed 5 → 1; a fare 6 → 1; app-config 8 → 0; the
  typeahead and "Popular from" 4–6 → 0. With ADR-IMPL-074 and -076 the API's CPU on the launch mix falls from 4.4 to
  0.9 ms a request (−80 %; −72 % with a fresh cookie; two runs over `main` at 0328ce3, 2 vCPU locally); k6 on staging,
  not run yet, is to give the absolute numbers.
- A write is seen everywhere within about a second instead of up to 30 s (flags) or 60 s (pins on the API replicas),
  by every process whose counters read; one whose reads fail keeps what it holds until they succeed again. A kill takes
  effect within a second, not at the next request; a process cut off from Postgres for 10 s counts every module
  killed, as a failed read did before.
- Memory per replica: the airports ~4 MB, typeahead ≤ 5 000 answers, ≤ 2 000 entries per memo, ≤ 20 000 members'
  versions per BFF route — bounded, against a 512 MB limit.
- A body may be up to a minute behind what its versions do not see: a site price stored meanwhile, as the pins'
  minute already allowed.
- A trigger's bump updates its counter's row in the statement that writes, and the row stays locked until that
  transaction ends: a second transaction writing a table with the same counter waits at its own write until the first
  one ends (`proposals.offers` and `proposals.offer_targets` share one counter). Writers of these tables are an import,
  a job, an operator: their transactions stay short. Two transactions that each write two reference tables, in
  opposite orders, can deadlock on the counters; Postgres ends one of them.
- Tests that change a reference table under a running app call `platform.reference.generations.invalidate()` — the
  second every other process would wait.
