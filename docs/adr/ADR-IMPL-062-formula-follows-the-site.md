# ADR-IMPL-062 — The formula prices as the company's site does; the site's new address

Status: proposed · Date: 2026-10-25 · Scope: `catalog` (`pricing/continents.ts`, `pricing/estimate.ts`, the new
`pricing/site-check.ts`, `application/site-cms.ts`, `application/site-sync.ts`, `infrastructure/place-photos.repo.ts`,
the sync job's timeout), the parity golden, `scripts/load-pricing-rules.ts --check-site`, `infra/RUNBOOK.md` · Amends
ADR-IMPL-037 (the Turkey override, the unconfirmed countries, the golden) and ADR-IMPL-045 (the site's address, the
pace of its reads, the job's timeout).

**Context.**

- **The formula against the site.** On 2026-10-25 the club's engine, with the reference rules (fingerprint
  `1f0e97176944a1ab`), was compared with the site's own search, the one the public site calls:
  `GET https://webapi.buybusinessclass.com/flights/search?from=&to=&trip_type=`. About 3,700 read-only requests, then
  about 250 fresh routes checked by seven independent reviewers, none of whom found the findings wrong. Business round
  trip, the estimate members see, equals the site on every route except these:
  - **Turkey.** ADR-IMPL-037 put Turkey in Europe "as the site prices Istanbul". The site prices it as Asia: 27 of 27
    fresh routes between North America and Turkey (Istanbul's airports among them) match the formula with Turkey in
    Asia, none with Europe. The override came from the marketing agent's data, not from the site.
  - **Countries the site files elsewhere than OurAirports.** The site prices Cyprus, St Barthélemy and Saint Helena
    (Ascension) as Europe and Timor-Leste as Oceania: for each, its business round trip from US airports equals the
    formula's base for that pair exactly.
  - **The unconfirmed countries.** The site confirms the club's continent for Armenia, Azerbaijan, Georgia and
    Kazakhstan (Asia), Greenland (North America) and Russia (Europe, all of it), and prices Cyprus as Europe — the case
    the set was made for.
  - **The letter Q and first class.** The site's business value of Q is not the reference set's (176 reference airports
    have a Q; the golden's 62 have none, so CI never saw it), and its first-class figures equal the club's only on the
    JFK routes the reference set was anchored on — elsewhere they differ on almost every route, as do premium economy's.
    These are the rules' values, not the engine's: only the company's current rules can fix them.
- **The site's address.** `weba.buybusinessclass.com` no longer resolves. The same API — `bestDeals/getAllDeals`,
  `getMain`, `getOne?id=`, the same JSON — answers at `https://buybusinessclass.com/api`, and the images at
  `https://buybusinessclass.com/storage/`. That API allows 120 requests per 60 s per IP (`x-ratelimit-limit`); a night's
  read is about 241 calls (2 lists, 7 regions, 78 countries, 154 cities), which four at a time would spend in seconds.
- **Photos stored under the old address.** The sync knows its photos by their address on the site. With the host
  changed, rows written under the old one would read as an operator's photo for ever.

**Decision.**

1. **Continents as the site prices them** (`pricing/continents.ts`). Turkey keeps OurAirports' Asia: the override is
   gone. Cyprus, St Barthélemy and Saint Helena are Europe, Timor-Leste is Oceania, each marked in the table as the
   site's.
2. **No country refused today.** `UNCONFIRMED_COUNTRIES` is empty since this comparison. The set and its check stay —
   a country between continents not yet compared with the site goes back in — and `estimateFare` takes the set as a
   parameter, so a test still proves that a listed country gets no estimate.
3. **The golden is the club's engine's.** With Turkey in Asia the engine no longer gives the Python engine's results on
   the golden's 32 Istanbul routes (128 of 15,128 lines), by design. The hash is recomputed exactly as the parity test
   computes it — the club's `formulaPrice`, the reference rules, the same 62 airports, lines and order — and the
   golden's `source` and `note` say so. The Python engine's hash stays beside it (`python`), with the one continent it
   filed otherwise: `formulaPrice` takes the continent table as a parameter (the site's by default), and the parity test
   also recomputes the lines with Turkey in Europe and must give that hash — so CI still checks every other line against
   an independent engine. Fingerprint, airports and count are unchanged; no price is stored; CI's step is unchanged.
4. **The site at its new address** (`application/site-cms.ts`): `SITE_API` is `https://buybusinessclass.com`,
   `SITE_STORAGE` its `/storage/`. `LEGACY_SITE_STORAGE` keeps the old images' address, and the sync's photo rows are
   recognised under either (`SITE_STORAGE_PREFIXES`, `place-photos.repo.ts`): the next night moves a photo stored under
   the old address to the new one, or hands it back — photos off, its city skipped or gone. No migration.
5. **Paced to the rate limit.** Every API request waits its turn: one start every 1.2 s across the pool, about 50 a
   minute. A 429 holds every worker for its `Retry-After` (seconds or an HTTP date; 60 s without one; at most 120 s),
   then that page is asked once more; a second 429 ends the read with a `SiteError` naming the page, and the night
   changes nothing, as any failed night. A read that fails stops its other workers, so none asks the site afterwards.
   Photo checks (HEAD on `/storage`, no stated limit) keep four at a time, unpaced. The clock is injectable
   (`SiteDeps.clock`, `catalogModule({ siteClock })`), so tests take no real time. The 120 a minute are the address's,
   not one read's: staging runs on the production host (ADR-IMPL-010) with the same crontab, so on a night both
   environments read the site, two reads at 07:40 spend one budget: at about 50 a minute each they stay under it
   together (a first draft paced 600 ms apart, and two reads met 429s; review asked for the margin). About five minutes
   of pages a night. `sync-site-destinations`' timeout goes from 100 s to 600 s, the platform's default: the pages, the
   photo checks and a 429 waited out.
6. **`scripts/load-pricing-rules.ts --check-site`.** For 24 routes — two per continent pair, both trips; Istanbul,
   Québec (YQB) and Seville (SVQ) among them; from North America, and LAX only as a destination, since the site prices
   LAX's one-way trips abroad its own way — asked one at a time, 500 ms apart, 5 s each, with the club's User-Agent, it
   compares the site's business and first with `formulaPrice(rules, …)`. It prints per cabin how many matched, differed
   or got no answer, and the routes that differ — never a price — writes nothing, and exits 1 when any route differs or
   when the site gave no business figure for a route (`siteCheckVerdict`: a check the site half answered is no pass, as
   a stale set could hide on the routes it left out; a missing first-class figure does not fail it). The comparison is
   `catalog/src/pricing/site-check.ts`, unit-tested with a fake `fetch`; without the flag the loader behaves as before.

**Consequences.**

- With estimates on (staging; production only after the company's approval, ADR-IMPL-037), trips between North America
  and Turkey show the site's figure; Cyprus, Russia, Kazakhstan, Armenia, Azerbaijan, Georgia and Greenland get an
  estimate where they had none; St Barthélemy, Ascension and Timor-Leste are priced on the site's continent. One of
  those new estimates is not the site's: Ganja is `GNJ` in the club and `KVD` on the site, and the formula prices the
  letters of the code, so the club's figure for `GNJ` is one the site does not show (below). In production
  `catalog.estimates` is off: no member sees a change today.
- The golden pins the club's engine with the reference rules, not the site: only business round trip was compared
  with the site, and its first-class lines carry the reference set's first-class values, which the site does not use.
  The Python engine's hash, checked with Turkey in Europe, keeps an independent engine behind every other line. A later
  change of continents changes the golden again, by the same recomputation, and adds that country to `python`'s
  `continents` with the continent the Python engine gave it.
- With the reference set, `--check-site` is expected to exit 1: the routes with a Q differ in business, and first
  differs on almost every route. That is the set's values, not the engine.
- A night's sync takes about three to five minutes — up to about seven when staging reads the site at the same time —
  longer than the worker's 120-s HTTP idle timeout: the cron's request, or an operator's, is closed while the run goes
  on, and `platform.job_runs` holds its outcome, as for `retention` (RUNBOOK, "The site's destinations"). Giving staging
  its own minute would need a crontab per environment (the crontab is generated from the job specs, ADR-IMPL-021); it is
  not done here.
- `--check-site` ran once against the live site with the repository's made-up test rules: all 24 routes answered the
  club's User-Agent (every route differed, as made-up rules must).

**Not in this change.** Codes the site spells differently (West Palm Beach `DJT` / `PBI`, Bishkek `BSZ` / `FRU`, Ganja
`GNJ` / `KVD`) and the 19 airports the site does not price at all get the club's estimate — as before, except Ganja,
which Azerbaijan's place in the unconfirmed set kept without one until now: emptying the set gives `GNJ` a figure the
site does not show under that code, as `DJT` and `BSZ` already had. A refusal by airport was not added for it alone; the
site's own price as the estimate's source, which removes all of them with the Q and first-class gaps, is the next step.

**Left to the owner.**

- Load the company's current rules (`scripts/load-pricing-rules.ts`, then `--check-site` on the same file): the site's
  business value of the letter Q is not the reference set's, and its first-class and premium-economy values differ on
  almost every route. `--check-site` names the routes. CI keeps the reference set (the golden's fingerprint) until the
  owner decides otherwise.
- Confirm with the company that `https://buybusinessclass.com/api` is the supported replacement for `weba.`, and that
  about 250 paced reads a night, plus about 150 photo checks, are acceptable — twice that from one address on a night
  staging reads the site too.
