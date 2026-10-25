# ADR-IMPL-064 — Three landmarks a city, and a city photo that finds Chișinău and waits out Wikimedia's 429s

Status: proposed · Date: 2026-10-25 · Scope: `catalog` (`application/place-photo-sources.ts`, `place-photos.ts`, the new
`landmark-sources.ts` and `place-landmarks.ts`, `infrastructure/place-photos.repo.ts`, the new `place-landmarks.repo.ts`
and `source-holds.repo.ts`, the new job `resolve-place-landmarks`, the new route `GET /v1/places/:code/landmarks`),
`packages/db` (`0039_catalog_place_landmarks.sql`, `20261025133511_snapshot_sync`), `packages/shared/src/api/v1/places.ts`
(additive: `PlaceLandmarksVM`), `scripts/seed-flags.ts`, `infra/cron/crontab`, `infra/RUNBOOK.md`, and the app
(`apps/mobile/src/features/places/` `landmark-logic.ts`, `landmark-store.ts`, `usePlaceLandmarks.ts`, `Landmarks.tsx`;
`app/destination/[code].tsx`, `app/(tabs)/explore.tsx`; `design/components.md`) · Amends decision D7 (brief 3.2:
landmarks) and ADR-IMPL-043 (the city photo: the IATA lookup, a city found by its name, a 429). The app draws them on
the destination's page (04) and Explore's chosen route (13): **The app** below.

**Context.** The owner asked for a real photograph of every city and three real landmarks of every destination, each
with its name and its licence (brief 3.2, requests 2 and 6). The research of 25 Oct 2026 (12 cities, WDQS, QLever and
Commons, 117 requests) found:

- **Chișinău (RMO).** Wikidata has RMO as the preferred IATA code of Q844951 (since 2024-01-18) and KIV at normal rank,
  ended that day. The job's own question answered RMO → Q844951 → Q21197 with both photographs, and replaying it gives a
  Commons photo (the cathedral's night view, CC BY-SA 4.0). What breaks a city like it is elsewhere: `wdt:P238` reads
  the best rank only (a demoted code finds nothing); a city whose airport Wikidata does not know within 50 km gets no
  photo at all; and a 429 from WDQS ("Aggressively rate-limiting to 1 req / min — active wdqs outage", Retry-After 1000)
  made the whole run `retry`, counted an attempt and pushed the city back up to 24 hours. A deployment's RMO row may
  also simply be an old `satellite` row waiting out its 30 days.
- **D7 read literally loses the famous sights.** Items "located in the city (P131 and its parents)" miss what Wikidata
  files under a coterminous item — the Colosseum (Roma Capitale), Buckingham Palace (City of Westminster) — and give
  Cape Town one item. Items within 20 km of the city item's coordinates keep them: 11 of the 12 sampled cities have at
  least three landmarks that pass D7's filters and ADR-IMPL-043's credit rules (10 of 12 for P131); Cancún has two
  candidates, both under 1600 px. Three exclusions dropped real landmarks and were removed: "subclass of administrative
  entity (Q56061)" drops the Eiffel Tower (observation towers sit under it), P576 drops Hagia Sophia (the churches before
  it were demolished), and without museums the Louvre and the Musée d'Orsay are neither attraction, landmark nor
  heritage.
- **Landscape rejects the icons.** The Eiffel Tower, Notre-Dame, Big Ben and Tokyo Skytree have portrait main images;
  Burj Khalifa's is 1558 px. Their night (P3451) and aerial (P8592) views rescue 9 of the 22 rejected items that have
  one — the Eiffel Tower by its aerial view, Chișinău's water tower by its own.
- **Sitelinks alone rank odd items first.** Reykjavík's most written-about sight is the Icelandic Phallological Museum.
- **WDQS is slow and was rate-limited.** One city's question took 2.8–33 s (Paris about 25 s) and only with
  `hint:Query hint:optimizer "None"` and the class closures as named subqueries; earlier drafts got 504 after 65 s and a
  `TimeoutException` after 60 s. 15 of 29 WDQS requests answered 429 (Retry-After 1000) on a shared egress; Commons
  answered 429 to 25 of 35 (Retry-After 20–57 s). On 25 Oct this step asked four WDQS questions (0.6–4.2 s, all 200 —
  the job's own landmark question for Chișinău in 0.75 s) and Commons twice (both 429, Retry-After 21 and 32 s); its
  review asked WDQS once more (the search for "Kishinev" with the search's order, 200 in 3.0 s).

**Decision.**

- **The city photo (amends ADR-IMPL-043's step 1).**
  - The IATA code is matched at any rank (`?airport p:P238/ps:P238 ?iata`): KIV finds Chișinău as RMO does.
  - **By its own name.** When Wikidata knows no airport within 50 km of ours, or the airport names no city, the city is
    looked up by its name: Wikidata's search (`wikibase:mwapi`, `EntitySearch`; accents and aliases find it —
    "Chisinau" finds Chișinău), human settlements (P31/P279\* Q486972) only, always within 150 km of the airport (five
    other Springfields are far from SGF): the one whose English name is the city we show; else the one the search puts
    first (its own order, `wikibase:apiOrdinal`: an alias matched whole comes before a name that only starts with it —
    "Kishinev" finds Chișinău first and the Chișinău Ghetto third, though the Ghetto lies nearer the airport); then the
    nearest, then the oldest item. One question a city — the search reads the first row of a VALUES block only (tried
    on WDQS) — two a run; a third city waits for the next run, its look not counted. The same tiers and credit rules
    follow (Commons, Pexels, the satellite view). A search that fails (a timeout, a 500) is its own city's failure (`retry`): the cities
    found by their airport keep their answers, and those still waiting for a search wait for the next run, uncounted —
    the run asks the search nothing more; a 429 still holds the whole run. The name is searched by its words: a tab or
    another control character (the airports' import keeps one inside a name) is a space, and a name of nothing else is
    not searched — a name the question cannot carry never stops a run.
  - **A 429 is not the city's fault.** Every Wikimedia request keeps a 429's Retry-After (seconds or a date; five minutes
    when it names neither; a day at most). The claimed cities wait that long, their look not counted (as `writeDeferred`
    does for Pexels' share), and the source is **held**: `catalog.source_holds` (`wikidata` or `commons`, `not_before`)
    — while any hold is on, `resolve-place-photos` asks nothing (the cities it claims wait for the hold) and neither does
    `resolve-place-landmarks`. Another failure still retries after `least(attempts, 24)` hours.
  - **A run inside its time.** Each request may take eight seconds; a run can ask the airports' question, two searches,
    Commons (two at once) and three Pexels questions — 56 s if each took its eight, past the job's 50 s, where the
    job's abort cut the Pexels question in flight and the cities left were counted as failed. A run's requests now end
    within 40 s of its start (`PLACE_PHOTOS_REQUESTS_MS`; the writes have the rest): a request starts only while it
    can end inside them, and a city that needed one waits for the next run, uncounted (`deferred`).
  - The city's Wikidata item (`qid`) is part of what the lookup returns; the landmarks start from it.
- **Landmarks (D7 as the evidence refined it).** The sights around the city item, for WDQS (`landmarkSparql`): items
  within **20 km** of the city item's P625, with an image and at least two sitelinks; an instance of a subclass of
  tourist attraction (Q570116), landmark (Q2319498) or **museum** (Q33506), or heritage-designated (P1435); not a
  populated place (P1082) and **never the city's own item**; no Q56061 or P576 exclusion; the forty with the most
  sitelinks; each item's main image, night view and aerial view, its English name (else its multilingual one), and the
  city's own photographs. Named subqueries and the optimizer hint, as the evidence found WDQS needs. Then, among the
  first twenty items by sitelinks (then the oldest item), and without the items an operator keeps out:
  - each item's first acceptable file — **P18, else P3451, else P8592** — that is not named as a map, a logo, a flag,
    a coat of arms (or in Spanish, French, German or Italian), a montage or a plan, and is no SVG;
  - Commons at 1280 px with the metadata (`Artist|LicenseShortName|LicenseUrl|AttributionRequired|Restrictions`): a
    JPEG **at least 1600 px wide**, landscape as the city photo's band is (**1.2 to 2.4 wide for 1 high** — the Louvre's
    night view, 2.52, is refused), its 1280-px thumbnail a real one, and ADR-IMPL-043's credit rules (`commonsCredit`,
    shared with the city photo): CC0, public domain or CC BY / BY-SA, no restrictions (`ita-mibac`, `personality`), an
    author when the licence asks;
  - **no duplicate image**: not one of the city's own photographs, not a file another landmark already shows (by name,
    and by its Commons page — a renamed file);
  - **at most three, fewer when fewer qualify; never invented.**
    The credit stored and served: `text` "<Artist, 80 characters at most> · Wikimedia Commons" (or "Wikimedia Commons"
    when the licence needs no author), `licence` (LicenseShortName), `licenceUrl` (Commons' LicenseUrl on https, when it
    gives one), and `pageUrl`, the file's own page on Commons (its author, source and licence), built from the stored
    file's name as MediaWiki writes a page's address (`commonsPage`) — what the credit links to, as the city photo's
    does (ADR-IMPL-043; CC BY and BY-SA ask for a link to the material where one is practicable).
- **The table** `catalog.place_landmarks` (0039, a named step after 0006; the drizzle snapshot levelled by the no-op
  `20261025133511_snapshot_sync`): per place (the airport code the app asks with) and rank, the city item, the landmark
  item, its name, the Commons file, the thumbnail's address and size, the licence and its address, the credit line,
  `fetched_at`, `expires_at` (30 days, spread over three more), `created_at`. Kinds (`catalog.place_landmark_kind`):
  `landmark` at ranks 1–3; **`fewer`** right after the last one found (rank 1 when none was; the city item null when no
  city was found) — the job looked and found fewer than three, and does not ask again for a month; `failed` (rank 1,
  alone) — no look has worked yet, tried again in six hours. Primary key (code, rank); CHECKs: rank 1–3, a landmark has
  everything the app shows and a marker none of it, `failed` only at rank 1, sizes above zero, https addresses, item ids
  `Q…`, `expires_at > fetched_at`; one marker a place (`place_landmarks_one_marker`); an airport removed takes its rows.
  `catalog.source_holds` (same step): one row a source, `not_before`, `created_at`.
- **The job** `resolve-place-landmarks` (worker, every five minutes, singleton, 240 s): nothing while the flag is off or
  a source is held; else up to **two** due places — the airports with a city photo row (the app has shown their city)
  and the site's cities' main airports, new ones first, then the longest due. The city item is the one the place's rows
  know, else the city photo's lookup (by airport, else by name); a remembered item that answers nothing at all, not
  even its own photographs (merged into another since), is looked up again rather than taken for a city without
  sights; a search by name that fails gives its place alone a `failed` marker and stops the run, the other place
  untouched for the next one. One WDQS question per city for its sights (a second when a remembered item answers
  nothing; 65-s timeout, WDQS stops one at 60 s), and Commons once per 50 files (a hundred files at most, two
  questions). A run's requests end within 225 s of its start (`LANDMARK_RUN_REQUESTS_MS`; the writes have the rest of
  the 240): a place starts only while its slowest look — the
  landmarks question twice and the city found again (a remembered item that answers nothing), Commons twice, 162 s
  (`LANDMARK_PLACE_MAX_MS`) — still ends inside them; else it waits for the next run, untouched (`later` in the run's
  counts). The cities found first take at most 24 s, so a run's first place always starts. A 429 holds that source
  for its Retry-After and stops the run, the places untouched. Another failure keeps what a place has (never a
  downgrade), looks again in six hours (a new place gets its `failed` marker) and stops the run. A place without a
  city found gets a `fewer` marker. Twice is the
  same rows: each is upserted by its rank (`created_at` kept), ranks past the new ones go, the old marker leaves before
  the new one comes (in one transaction). User-Agent `BBCClub/1.0 (<APP_ORIGIN>; landmarks)`.
- **The flag** `catalog.landmarks`, seeded `{ "enabled": false, "skip": ["Q177174"] }` (the Icelandic Phallological
  Museum): off, the route serves none and the job asks nothing. `skip` is the operator's override, by Wikidata item:
  the route leaves a skipped landmark out at once, and the next look picks another in its place.
- **The route** `GET /v1/places/:code/landmarks` (`fares:read`, the place photo route's permission; rate rule `read`):
  `PlaceLandmarksVM { code, landmarks: [{ name, imageUrl, width, height, credit: { text, licence, licenceUrl?, pageUrl? } }] }`,
  best first, from the table at once; a strong ETag over the body, 304 on `If-None-Match`, `Cache-Control: private,
no-cache`; 404 for a code that is no airport (or not three letters). The contract (`packages/shared`, additive — the
  change to shared this ADR covers) drops a landmark an app cannot read, never the whole answer, and keeps three.
- **Metrics** `bbc_place_landmarks_resolved{found}`, `bbc_place_landmarks_failed{stage}`,
  `bbc_place_landmarks_held{stage}`, `bbc_place_photos_held{stage}`.
- **The app** (brief 3.2 step 2).
  - **Where.** The images draw no landmarks. They show on the destination's page (04), under its flight options and
    the city photo's credit (not on its home-airport message), and in Explore's sheet at a chosen route (13), under its
    flight options — below the first flight, so the sheet's stops do not move. 05's strip of thumbnails stays the
    fare's (the city, the seat, the lounge, as `REFERENCE-SPEC.md` fixes it). The section is built from what 04, 13,
    03, 05 and 08 already draw and reads 04's and 13's own measures (`optionsColumn`); `design/components.md`
    (`Landmarks`) holds its anatomy, pending a designer.
  - **What.** Up to three, in the server's order; fewer when fewer exist; none — nothing at all (no title, no frame,
    no skeleton, no error: a decoration). Each photograph at its own shape within the 1.2–2.4 band; a shape outside it
    (a later server's) fills the nearest edge of the band, cropped (`LANDMARK_SHAPE`). Its name under it, then its
    credit as the city photo's reads (`Photo: <author> · <licence> · Wikimedia Commons`), linked to `pageUrl`, else
    to `licenceUrl` (a server before `pageUrl`), else only read. A landmark without a name, without a credit it can
    print (no one to credit, no licence) or showing a photograph already shown is left out, never replaced. A
    photograph that will not load leaves with its name and credit, and is tried again when a screen showing landmarks
    comes back into view or the phone back online. A screen reader hears `<name>, photo`, then the credit. testIDs
    `destination.landmark.<rank>` and `.credit` (`explore.` on 13).
  - **Asking.** One store for every screen, for the session: a city is asked when a screen showing it comes into view
    or the phone back online, and what the app knows has aged — landmarks after 12 hours (the place photos' own
    window), none yet after five minutes (the job reaches a new city within a few), a code that is no airport or an
    answer the app cannot read after an hour — with the ETag it holds (`If-None-Match`; a 304 keeps what it has).
    Offline, nothing is asked. A failed question (a timeout, an error, a 429, the network gone) changes nothing; the
    next view, or the phone back online, asks again. A landmark the app cannot read is dropped by the contract, never
    the list; a body of another shape or for another code is unreadable: nothing shown.
  - **Skips.** An operator's `skip` reaches the route within about 35 s (the flag's cache); an app that already
    showed the city drops the landmark at its next question for it — within 12 hours of its last answer, or at its
    next cold start.
  - Tests (`apps/mobile`): `landmark-logic.test.ts` (reading the answer, the credit, which to show, the shape, the
    floor over the tiles), `landmark-store.test.ts` (the windows, the ETag, a failure, the photographs tried again),
    `landmarks-section.test.ts` (the floor through the element tree the section builds, on both looks),
    `destination-geometry.test.ts` (04's and 13's flight options, the measures the section reads),
    `usePlaceLandmarks.test.ts` (when a screen asks: in view and online, again back online),
    `api-landmarks.test.ts` (the question through `api.ts`: If-None-Match, 304, a body it cannot read, 404, 429).

**Consequences.** A destination shows up to three landmarks a few minutes after its city is first shown (two places
every five minutes, about 576 a day). Under a WDQS outage rule (one request a minute) the first 429 holds both jobs for
its Retry-After instead of retrying every minute. A skipped landmark leaves the answer at once (an app already showing
it, at its next question: within 12 hours); its replacement comes with the city's next look (the RUNBOOK says how to
make that now). Tests: `tests/unit/place-photos.test.ts` (any rank,
by name, Retry-After, the 429 outcomes), `tests/unit/landmarks.test.ts` (the question, reading the answer, D7's filters
on WDQS's and Commons' saved answers for Paris and Chișinău — the Eiffel Tower and the water tower rescued by their
aerial views — the city's own item, duplicates, the contract), `tests/contract/place-photos.test.ts` (a 429 defers and
holds), `tests/contract/place-landmarks.test.ts` (the job twice, a 429 — and a shorter one after it, which never
shortens the hold — a failure, fewer than three, a drop from three to one and to none, the site's cities, the route, the
CHECKs), `apps/api/test/catalog-landmarks.test.ts` (the route through the host). The saved answers keep sizes, types,
licences and restrictions as Commons gave them; authors are made up and files whose name credits a person renamed.

**Left to the owner.**

- **The radius.** 20 km brings Versailles (18 km) and the Stade de France into Paris; a smaller one loses sights filed
  outside a city's centre. One constant (`LANDMARK_RADIUS_KM`).
- **Portrait icons.** Notre-Dame, Big Ben, Tokyo Skytree and Tokyo Tower have no landscape view at all. The app now
  shows a shape outside 1.2–2.4 at the band's nearest edge, cropped, so relaxing the job's band to admit portraits
  needs no app change; whether to relax it (a portrait cropped to 1.2 wide loses most of a tower) stays open.
- **Skips in an open app.** The app revalidates a city it found landmarks for after 12 hours, as the brief asks (no
  more often than the place photos). If skips must leave open apps sooner, a found city can be revalidated on each
  view after a shorter window — a 304 costs little — as a deliberate exception.
- **The undrawn section.** The images draw no landmarks; the section is the club's own arrangement of drawn parts
  (`design/components.md`, `Landmarks`) until a designer draws it.
- **More overrides.** The skip list holds one item; the operator adds others as cities are looked at (Hallgrímskirkja
  and Harpa are absent from Reykjavík's answer, which was not investigated; Table Mountain is a `mountain`, so Cape Town
  never gets it). Resort cities like Cancún may have fewer than three.
- **The 80 % target** was measured on 12 cities, not the site's 154; the job's own counts (`fewer`) will tell.
- **Credits.** Closed by the destination screen's step: the contract carries the file's Commons page too (`pageUrl`,
  additive; a server before it sent none), and the app links it as the city photo's credit links its page — the
  licence's page only from a server that sends no page.

**Rejected.** P131 and its parents (loses the Colosseum and Buckingham Palace). QLever (faster, 1.6–7.3 s, the same top
three as WDQS wherever both answered) — another provider's availability for a production job; WDQS stays the source, and
the question is plain SPARQL apart from its hints. Asking at request time — a member's screen would wait on WDQS.
Counting a 429 as a failure — it pushed cities back a day for an outage rule.
