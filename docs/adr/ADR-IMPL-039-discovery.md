# ADR-IMPL-039 — Discovery: "Popular from <city>" and the suggested home airport

Status: accepted · Date: 2026-10-08 · Scope: P2 (server); the app shows both in a later release

**Context.** Two additions were approved on 7 Oct 2026: Explore shows _"Popular from New York"_ — a few destinations
members search from the member's home — and onboarding suggests a home airport from the phone's time zone. The demand
pipeline (ADR-IMPL-032) already counts searches per UTC day in `catalog.demand_daily`, with no identity. Those counts
describe other members: shown as numbers, or for a route almost nobody searched, they say more than they should.

**Decision.**

- **Popular** — `GET /v1/airports/popular?from=JFK` → `PopularVM { from, destinations }`, at most four `AirportVM`.
  The rules approved on 7 Oct 2026: the seven most recent UTC days of `demand_daily`, all cabins together; a route
  counts from **5 searches** (the counts are searches, not people, so the bar sits above the draft's 3); at most **4**,
  busiest first, ties by code. Never the origin, never an airport under 100 km from it (`SAME_METRO_KM`: Newark is not
  "popular from" JFK), never twice, only airports in `catalog.airports`. The club's busiest hubs fill the rest, by
  `popularity` (the curated hubs are 40–100, every other airport is below 40). **Names only**: no count, no share, no
  rank number leaves the server; the order is the only signal.
- **Home suggestion** — `GET /v1/airports/home-suggestion?tz=Europe/Chisinau` → `HomeSuggestionVM { airport }`: the
  busiest airport whose `tz` is the phone's zone, or `null`. A phone may report a name the data spells differently:
  Android reports ICU's name (`Asia/Calcutta`, `America/Cordoba`) where the data has IANA's current one, and a phone
  with old time zone data reports a retired name (`America/Yellowknife`) or a country-level one (`GB`, `Canada/Eastern`,
  `Japan`). `ZONE_ALIASES` maps those to the data's name — only the same place renamed or merged, or a country's own
  legacy name, never a link to another country that merely shares the clock (`America/Marigot` is not Trinidad). UTC and fixed offsets are valid zones but not places: `null`. A value this
  runtime cannot format, an empty one, or one over 64 characters: 400. A test fails when an airport uses a zone that
  neither ICU reports nor an alias reaches.
- **Access** — both `fares:read` (members; onboarding runs signed in), rate rule `read`, declared with `registerRoute`.
  Contracts: `shared/src/api/v1/discovery.ts`, with no upper bound on `destinations`, so a later server that sends more
  never breaks an older app.
- **Cost** — popular: three or four small queries (the origin, the searched routes, their airports when there are any,
  the hubs); with Redis, cached 5 minutes under `catalog:popular:{airports gen}:{FROM}`, so a catalogue import refreshes
  it. The list depends on the origin alone, never on the member. Home suggestion: one query. Query budgets: 10 each
  (measured 4 and 2). `demand_daily` holds at most 1,000 routes a day, so no new index.
- **Observability** — `bbc_popular_destinations_shown{source="searches"|"hubs"}` counts what was shown. A list that
  stays all hubs means demand is not flowing.

**Consequence.** Until `catalog.search_events` is on (with Kafka and Redis) and `demand-rollup` has run, "Popular" is
the hubs alone — today in staging (no Redis, no Kafka) and in production (flag off). That is the fallback working, not a
fault. The suggestion is the zone's busiest airport, not necessarily the member's: Dallas gets Chicago O'Hare (both
`America/Chicago`), Boston gets JFK. The app offers it for the member to confirm, never as a silent default.

**Rejected.** Counts in the response — privacy. A popular list per member — it needs identity on search events, which
ADR-IMPL-032 forbids. IP geolocation — a new processor of personal data, and wrong behind a VPN. Device location — a
permission prompt at onboarding for a convenience. Following every IANA link — some join different countries that
share a clock. Popularity from fares — that is supply, not demand.

**Residual risk, accepted.** A Count-Min Sketch only overcounts — by at most 1 % of the searches counted that day
(99.9 %). Once a week holds about 500 searches, noise alone could lift a route to the threshold; then the rollup should
store the Top-K count or the smaller of the two. Searches, not people: one member searching a route five times in a
week makes it "popular" from that origin — only its name shows, among others.

**Follow-up.** The app: "Popular from <city>" on Explore and the suggestion at onboarding (an OTA release, with the
Figma frames of 7 Oct 2026).
