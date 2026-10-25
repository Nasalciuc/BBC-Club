# ADR-IMPL-045 — The site's destinations: its photos, and its cities on the globe

Status: accepted · Date: 2026-10-12

**Context.** The company's site sells 154 cities. Its backend — `weba.buybusinessclass.com`, the API the site and its new
version both read (`/api/bestDeals/getAllDeals`, `getMain`, `getOne?id=`) — keeps for each one a photo chosen by people,
an About text, SEO texts, and the prices it lists from US cities ("Old Price", "Price Today"), under regions and
countries. It has no airport codes. The app had none of this: the globe shows only routes with a published fare (none in
production yet), and a city's photo comes from Wikimedia Commons (ADR-IMPL-043). The owner asked to take what the site
already has (12 Oct 2026). What was read on 12 Oct: the site shows several prices for one route (London from New York
$788 on London's page, $2,025 for the United Kingdom on the Europe page, and its search, the formula of ADR-IMPL-037,
a third); some pages show another city's photo (Crete shows Santorini's, and seven countries share Spain's); "Victoria"
is the Seychelles' capital; "Benglaru" is misspelled; Kyoto has no airport of its own. (Amended by ADR-IMPL-062: since
`weba.` stopped resolving, the same API answers at `buybusinessclass.com/api`, and the photos at its `/storage/`.)

**Decision.**

- **One job, once a night** — `sync-site-destinations` (worker, 07:40 UTC, singleton, 100 s): regions → countries →
  cities, then each city's page, at most four requests at a time, the club's User-Agent, 10 s a request; then a HEAD
  request for each city's own photo. (Amended by ADR-IMPL-062: the API's requests start 600 ms apart, under its rate
  limit; a 429 waits and asks once more; the job's timeout is 420 s.) All or nothing: a region or a country that does
  not answer, fewer than 80 % of last night's cities listed or placed on their airports, or more than 10 % (at least
  three) city pages unanswered — the run fails and changes nothing. One city page that does not answer keeps last
  night's rows; a photo that cannot be asked about (no answer, a 5xx) keeps last night's verdict.
- **From names to airports** — a city is matched to the airports whose city, or one of whose search terms, is its name,
  inside the country the site puts it in (London, not London, Ontario; Victoria, the Seychelles' through SEZ's search
  term); our country names and the site's meet through the airports' `COUNTRY_ALIASES` (Turkiye). When the names cannot
  tell them apart, the city's own name in a single country. The names that need help are listed by the site's id in
  `SITE_CITY_AIRPORTS`: Benglaru → BLR, Ho Chi Minh → SGN, Kilimanjaro → JRO, Crete → HER, CHQ, JSH, Kyoto → none; and
  the cities whose airports rank alike in the reference, main airport first (Osaka → KIX, Bucharest → OTP, Amman → AMM,
  Tenerife → TFS, Chengdu → TFU, Colombo → CMB, Glasgow → GLA, Taipei → TPE) — a tie the list does not settle is logged
  for listing. The US cities the site lists prices from: a metro area's airports (`SITE_ORIGIN_AIRPORTS`: New York,
  Washington, Chicago, Houston, Dallas), else the busiest US airport of that name. The main airport — the busiest, or
  the first listed — is the city's pin. A test maps the site's 154 cities of 12 Oct against the reference: 153 placed,
  Kyoto not, no tie left.
- **A snapshot, not a mirror** — the named step `0028_catalog_site_destinations.sql` (after 0006; drizzle brought level
  by a no-op `20261012143006_snapshot_sync`): `catalog.site_places` (the site's id, name, country, region, main airport,
  every airport, whether the site's home page shows it, the photo's path when the photo is the city's own) and
  `catalog.site_routes` (US airport → city, the site's price and old price, kept, never shown). Replaced in one
  transaction. The About and SEO texts are not kept: nothing in Figma shows them.
- **The site's photos** (flag `catalog.site_photos`, seeded off): each city's own photo — `bestDeals/<its id>/image/…`,
  answering as an image — on every one of its airports, stored as an operator's photo (`source = override`, no credit
  line, never expiring, untouched by `resolve-place-photos`). The job owns such a photo by its address on the site; an
  operator's photo from anywhere else wins. A borrowed photo is not used. An airport two cities name takes the photo of
  the one with the lower id. `skip` lists cities (the site's ids) left on Wikimedia. Off: the next run gives every site
  photo back to the resolve job; off and `skip` act before the site is asked, so a night it does not answer still obeys
  them. No change in the app: a photo that is not Wikimedia's loads plainly, and one without a credit has no credit line
  (ADR-IMPL-043).
- **The site's cities on the globe** (flag `catalog.site_pins`, seeded off): after the fares' pins, up to twelve of the
  site's cities listed from the member's home airport (the site's home page first, then the busiest), a city skipped
  when one of its airports already has a pin — a fare's, or an earlier site city's. **One number per route and cabin**:
  a pin is priced by the formula (ADR-IMPL-037) in the cabin the member's search starts in (Profile, else business) —
  the number its estimate row and the quote will show. No formula (estimates off, as in production until the company's
  written approval): no price, no pin. One read for the pins and one for the home airport, cached a minute like the
  fares' pins and dropped with them when the sync or an import bumps the generation. The home screen's ETag carries each
  pin's price. `DestinationPinVM` does not change; the app does not change.

**Consequences.** The worker reaches `weba.buybusinessclass.com` over 443 (about 400 requests a night); members' phones
load the site's photos from it once `catalog.site_photos` is on. `/v1/home` costs at most four more reads with the pins
on (`query-budget.test.ts`). The run's counts are in `platform.job_runs`; log lines name what was not placed.
`scripts/site-destinations-report.ts` shows, with no database, what the site holds today and what the job would place —
before a flag goes on. Tests: `tests/unit/site-places.test.ts` (reading the site, the names, the photos, the snapshot),
`tests/contract/site-sync.test.ts` (the job, its photos, its failures, the pins), `apps/api/test/catalog.test.ts` (the
home screen), the query budget. (Amended by ADR-IMPL-062: the worker and the phones reach `buybusinessclass.com`.)

**Deviations, reported (owner's decision).**

- `design/components.md` (Photography): _"never landmarks… postcards"_. The site's photos often are; the app takes the
  site's visual language (the owner's choice, 12 Oct 2026), and Figma's own offer page shows Parliament at night
  (135:846). `skip` and an operator's photo replace any of them.
- The pins of fares stay as they were (the cheapest fare in any cabin): pricing them in the member's cabin would take
  Singapore — a first-class fare — off the staging demo Figma draws.

**Rejected.** The site's prices as offers — a broadcast offer pushes to every member each day, and offers are not
filtered by the member's city. As fares — a fare has a carrier, times and a validity. As the estimate — the site shows
several prices for one route; which one the app shows is the company's call, not this ADR's (a later change, with the
estimate's basis carried to the specialist's e-mail, which says "(formula)" today). Country and region photos as a
fallback — they are often another country's. All the site's cities as pins — the instant globe (`GlobeFallback`) is
built for a handful of pins. Storing the photos (MinIO) — after R1b, when MinIO serves `/media/*` in production.

**Residual risk, accepted.** A photo the site replaces fails at its old address until the next night; the app shows the
club's image meanwhile. A city the names cannot place stays off the snapshot until it is listed in `SITE_CITY_AIRPORTS`.
The site's robots.txt asks crawlers away; this is the company's own system reading its own API, at night, named.
