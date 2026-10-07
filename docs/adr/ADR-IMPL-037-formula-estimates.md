# ADR-IMPL-037 — Indicative prices from the company's formula

Status: accepted · Date: 2026-10-07 · Scope: P1a (search); P1b adds the estimate to the request and the CRM

**Context.** Management decided that, for now, routes without a published fare show the company's price formula — the
generator behind the BBC site and the marketing posters. A member who sees "$2,055" on a poster must see $2,055 in the
app, never a different figure. A fare and an estimate are different things: a fare has a carrier, times and a validity,
and is bookable; an estimate is none of these. The formula's numbers are the company's: this public repository does not
hold them (owner, 7 Oct 2026).

**Decision.**

- **The formula** — `catalog/src/pricing/estimate.ts`: the base for the continent pair (trip, cabin), plus a value per
  letter of each IATA code, plus a supplement between Honolulu and the United States. Only routes touching North America
  have a price; anything else is `null`, never a guess. A port of `Nasalciuc/BBC-Marketing-Agent@747b5c7`, whose engine
  states it is identical to the site's. Continents come from OurAirports (public domain) by country, with one override:
  Turkey → Europe, as the site prices Istanbul. `ZZ` (OurAirports' "unknown country", listed under Africa) is left out.
- **The rules stay out of the repository** — `pricing/rules.ts` holds their shape only: a strict schema (26 letters ×
  3 cabins, 6 continent pairs × 2 trips × 3 cabins, the Hawaii supplement; whole dollars), with the field names of the
  agent's `data/price_generator_rules.json`. Their values live per environment in the flag row `catalog.pricing_rules`,
  `{ rules, fingerprint, loadedAt }`, written only by `scripts/load-pricing-rules.ts`, and in CI in the
  `PRICING_RULES_JSON` secret. The fingerprint — SHA-256 of the canonical JSON, 16 hex characters — names a rule set
  without revealing it; a row whose fingerprint is not its rules' own was edited by hand and is refused. The loader
  prints the fingerprint and the poster check, never a rule. `.gitignore` ignores `*pricing-rules*.json`, and CI's
  "Refuse tracked store secrets" fails if one is tracked. `BBC-Marketing-Agent` becomes private. A module reads such a
  row through `platform.flags.read`, added to `ModulePlatform` for this: the whole cached value, validated by the
  caller.
- **Parity** — the Python engine was run once with the reference rules (fingerprint `1f0e97176944a1ab`) on every ordered
  pair of its 62 airports, both trips, business and first: 15,128 results. `tests/parity/pricing-golden.json` keeps
  their SHA-256, the airports and the rules' fingerprint — no price. CI's step "Price formula parity" recomputes all of
  them in TypeScript from the secret and compares the hash; without the secret (a laptop, a fork) the suite is skipped.
  CI keeps the reference set; an environment may run a newer set without a CI change, as the engine is the same
  function. That engine _states_ it matches the site; the approval pack's routes are what confirm it before production.
  No Python enters this repository.
- **Logic tests** run on made-up rules of the same shape (`tests/unit/pricing-rules.fixture.ts`), chosen so that every
  display rule has a case.
- **What a member sees** (owner, 7 Oct 2026) — the estimate follows the chosen cabin: business whenever positive; first
  only when positive and above business; premium economy never (the formula can be negative there, and the site hides
  it). Round trip only, matching the approved copy _"From $2,055 · round trip"_ + _"Indicative · your specialist confirms
  the fare"_.
- **Contract** — `SearchResultVM.estimate: EstimateVM | null`, optional; `AirportVM.tz`, optional (local time).
  `EstimateVM` has fixed literals (`USD`, `round_trip`, `formula`), so any other value fails parsing. It never uses
  `PricePair`: `published` is reserved for FTC-evidenced reference prices. Both upgrade orders work: an older app drops
  the new fields; a newer app accepts their absence from an older server.
- **When** — only when an undated search has no fare in the chosen cabin; published fares always win. The app sends no
  date. With one (`when`), the route may have fares on other days, so there is no estimate.
- **Never where it would mislead** (review of 7 Oct 2026) — no estimate between two airports under 100 km apart (one
  metro: the formula would price JFK–EWR as a flight), and none for a country between continents that the site's airport
  list does not cover (`UNCONFIRMED_COUNTRIES`: AM, AZ, CY, GE, GL, KZ, RU — the formula would guess, and Cyprus priced
  as Asia is not Cyprus priced as Europe). A country leaves that set once one route is compared with the site.
- **Resilient contract** — the app parses the whole search with `SearchResultVM`; `estimate` is `.catch(null)` and
  `AirportVM.tz` is `.catch(undefined)` — with a zone this runtime cannot format in counted as not understood (the
  check the catalogue import makes) — so a value this app does not understand hides the estimate or the zone instead of
  failing the search.
- **Flags** — `catalog.estimates` (the module's convention, like `catalog.search_events`), off unless set; seeded off by
  `scripts/seed-flags.ts` at the next bootstrap, insert-only. Both rows are read only when a search has no fare, so
  searches with fares cost nothing extra. A failed read counts as off; missing or refused rules mean no estimate, never
  an error. Both are cached: a change reaches every replica within ~35 s (shared flag cache 30 s + local 5 s). There is
  no estimates-only instant switch: `catalog.killed` is instant but stops all of Explore — a last resort. On in staging
  once its rules are loaded; in production only after the company's written approval (an approval pack: screens A1 and
  A4, routes compared with the site, the approved copy). Steps: `infra/RUNBOOK.md`, "Price rules for estimates".
- **Observability** — `bbc_search_estimates_shown{cabin}` counts every estimate returned;
  `bbc_search_estimates_unavailable{reason="missing"|"invalid"}` every search that found no usable rules.

**Rejected.** An estimate as a `FareVM` with a `kind` — an older app would show it as a bookable fare. A separate
`/v1/estimate` endpoint — one more round trip per destination. Fixing the formula's oddities ourselves — the app would
then disagree with the site. The rules in this repository — public. An environment variable — a restart for every
change, and a JSON value quoted through env files and the shell scripts that read them. A table of the catalog's own —
a migration and a cache of its own, for what a flag row already gives.

**Residual risk, accepted.** The code shows the formula's shape (letters, continent pairs, the Hawaii rule), not its
numbers. Every estimate is an output of the rules, as every price on the site is: enough outputs can be solved back to
the numbers, from the app as from the site. The golden's hashes can only confirm a guess, as the site's own prices
can. The rules were readable in `BBC-Marketing-Agent` until it became private; earlier copies cannot be recalled.

**Known limitation, kept for parity and reported to the company.** Only Honolulu gets the Hawaii supplement: Maui
(OGG), Kona (KOA) and Kauai (LIH) price lower than Honolulu from the same city.

**Follow-up.** P1b — the server recomputes the estimate when a member asks for a quote, stores it, and adds one line to
the CRM e-mail, so the specialist knows the figure the member saw. A weekly parity check against the site, once the
company allows the server to query it.
