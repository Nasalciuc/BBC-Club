# ADR-IMPL-064 — Three landmarks a city, and a city photo that finds Chișinău and waits out Wikimedia's 429s

Status: proposed · Date: 2026-10-25 · Scope: `catalog` (`application/place-photo-sources.ts`, `place-photos.ts`, the new
`landmark-sources.ts` and `place-landmarks.ts`, `infrastructure/place-photos.repo.ts`, the new `place-landmarks.repo.ts`
and `source-holds.repo.ts`, the new job `resolve-place-landmarks`, the new route `GET /v1/places/:code/landmarks`),
`packages/db` (`0039_catalog_place_landmarks.sql`, `20261025133511_snapshot_sync`), `packages/shared/src/api/v1/places.ts`
(additive: `PlaceLandmarksVM`), `scripts/seed-flags.ts`, `infra/cron/crontab`, `infra/RUNBOOK.md`, and the app
(`apps/mobile/src/features/places/` `landmark-logic.ts`, `landmark-store.ts`, `usePlaceLandmarks.ts`, `Landmarks.tsx`;
`app/destination/[code].tsx`, `app/(tabs)/explore.tsx`; `design/components.md`) · Amends decision D7 (brief 3.2:
landmarks) and ADR-IMPL-043 (the city photo: the IATA lookup, a city found by its name, a 429). The app draws them on
the destination's page (04) and Explore's chosen route (13): **The app** below. Amended the same day (G3a, the city
photo's coverage: a landmark stands in for a city on its satellite view, and the Free Art License; a one-page TIFF was
weighed and withdrawn — below).

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
    shared with the city photo): CC0, public domain or CC BY / BY-SA (amended below, amendment 2: and the Free Art
    License, its address read on https), no restrictions (`ita-mibac`, `personality`), an author when the licence asks;
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
    print (no one to credit, no licence) or showing a photograph already shown is left out; nothing made up takes its
    place. A photograph already shown includes the city's own over the page: on 04, a landmark whose `imageUrl` is the address
    the page draws as the city's photograph (`photoAddress`: the place photo's `hero`, exactly as the server sent it,
    the photo band drawing it unchanged — not the design's own bundled photograph, not the satellite view) is left out,
    so a landmark standing in for the city's photo (amendment 1, below) is not shown twice; it is left out before the
    three are counted, so a further landmark the server sent would take its place — today the server keeps three and
    the contract reads three, so a stand-in's city shows at most two. 13 draws the globe, not the city's photograph,
    and keeps the stand-in's landmark (`cityPhoto` null: each screen says what it draws). Every landmark shown still
    has its credit; fewer show what exists; a stand-in's city with no other landmark shows nothing. A photograph that
    will not load leaves with its name and credit, and is tried again when a screen showing landmarks comes back into
    view or the phone back online. A screen reader hears `<name>, photo`, then the credit. testIDs
    `destination.landmark.<rank>` and `.credit` (`explore.` on 13).
  - **Asking.** One store for every screen, for the session: a city is asked when a screen showing it comes into view
    or the phone back online, and at each minute's look while it stays in view (as the place photos are), once what
    the app knows has aged — landmarks after 12 hours (the place photos' own window), none yet after five minutes (the
    job reaches a new city within a few), a code that is no airport or an answer the app cannot read after an hour —
    with the ETag it holds (`If-None-Match`; a 304 keeps what it has). A look before then asks nothing; offline,
    nothing is asked. A failed question (a timeout, an error, a 429, the network gone) changes nothing; the next look
    asks again. A landmark the app cannot read is dropped by the contract, never the list; a body of another shape or
    for another code is unreadable: nothing shown.
  - **Skips.** An operator's `skip` reaches the route within about 35 s (the flag's cache); an app that already
    showed the city drops the landmark at its next question for it — never sooner than 12 hours after its last answer
    for the city: within a minute of them while a screen showing the city is on screen, else when one next is, or at
    the app's next cold start.
  - Tests (`apps/mobile`): `landmark-logic.test.ts` (reading the answer, the credit, which to show, the shape, the
    floor over the tiles; the city photograph's address and the stand-in's landmark left out before the three are
    counted), `landmark-store.test.ts` (the windows, the ETag, a failure, the photographs tried again),
    `landmarks-section.test.ts` (the floor through the element tree the section builds, on both looks, with and
    without a stand-in; 04 leaves the stand-in's landmark out, 13 keeps it),
    `destination-geometry.test.ts` (04's and 13's flight options, the measures the section reads),
    `usePlaceLandmarks.test.ts` (when a screen asks: in view and online, again back online, each minute while in
    view — a skip within a minute of the 12 hours, none yet within five minutes, a failure at the next look),
    `api-landmarks.test.ts` (the question through `api.ts`: If-None-Match, 304, a body it cannot read, 404, 429).

**Consequences.** A destination shows up to three landmarks a few minutes after its city is first shown (two places
every five minutes, about 576 a day). Under a WDQS outage rule (one request a minute) the first 429 holds both jobs for
its Retry-After instead of retrying every minute. A skipped landmark leaves the answer at once (an app already showing
it, at its next question: 12 hours after its last answer for the city, within a minute of them while the city is on
screen); its replacement comes with the city's next look (the RUNBOOK says how to make that now). Tests: `tests/unit/place-photos.test.ts` (any rank,
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
  more often than the place photos; a screen left open, within a minute of them). If skips must leave open apps
  sooner, a found city can be revalidated on each view after a shorter window — a 304 costs little — as a deliberate
  exception.
- **The undrawn section.** The images draw no landmarks; the section is the club's own arrangement of drawn parts
  (`design/components.md`, `Landmarks`) until a designer draws it.
- **A stand-in's city shows two landmarks on 04.** Its first landmark is the photograph over the page (amendment 1), so
  the list leaves it out; the job keeps three ranks and the contract reads three, so nothing comes up into the third
  place. A fourth rank — kept by the job, read by the contract (`packages/shared`) — would fill it; not in this change.
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

## Amendment — 25 Oct 2026: the city photo's coverage (G3a)

**Context.** The pre-registered check 3.2 — "of the site's 154 cities at least 95 % have a city photo" — failed: this
branch's own code, against live Wikimedia, gave 118 of 154 (76.6 %). 35 cities fell to the satellite view and Kyoto has
no airport. What each of the 35 has on its city item, judged by `acceptCommons` (a city can fail several ways): 18 a file
no wider than 1280 px, 9 a panorama (wider than 2.4 for 1), 3 a file that is not a JPEG (one TIFF, two PNG), 3 the Free
Art License, 2 no usable file at all, 2 a portrait, 1 no author. Raised in this order, without lowering any rule:

1. **A landmark stands in for the city photo.** With `catalog.landmarks` on, where `GET /v1/places/photos` would answer
   a city's satellite view, it answers `photo` with the first landmark the landmarks route shows for the place (the
   lowest rank among its `landmark` rows, without the flag's `skip`): the landmark's 1280-px thumbnail as `hero`, the
   same file at 500 px as `card` (Wikimedia's standard width, the address's `1280px-` made `500px-`; the 1280-px
   address when it is no standard thumbnail's), and that photograph's own credit (source `wikimedia`, its author — the
   credit line read back —, its licence, its Commons page from the file's name: `commonsPage`, the one that writes the
   landmarks route's `pageUrl`, so both link the photograph to one address). Its photograph already passed D7,
   stricter than the city photo's rules (at least 1600 px, 1.2–2.4, JPEG, the same credit rules). A photo of the city's
   own — Commons', Pexels', the club's — stays first. The contract keeps its shape: `packages/shared` is not touched.

   **Only the satellite view, not a city not looked up yet (`none`).** The satellite view is the photo job's answer
   that the city has no photograph of its own; `none` is a city it has not decided yet, usually within a minute.
   Phones ask about a `none` again after 50 s but keep a photo for twelve hours (`place-photo-store.ts`), and the
   landmarks job may already hold rows for a city whose photo row is pending: a site city asked about for the first
   time (the job covers the site's cities' airports), a city an operator handed back (`DELETE …/photo`), or one a site
   sync cleared. A stand-in there would hide the city's own photo, found a minute later, for twelve hours. The task
   named both; `none` was left out in review the same day and is listed for the owner below.

   **Composed when the route reads, not written by the photo job**, because:

   - the server's next answer follows the flag and its `skip`: off, the answer is exactly what it was (no landmark is
     read); a skipped landmark gives way to the next rank, and to the satellite view when none is left. A written
     stand-in would outlive both for up to 33 days. A phone that already holds a stand-in keeps it (below);
   - landmarks come after the city photo: `resolve-place-landmarks` looks up the cities the app has shown, two every
     five minutes, while the photo job decides a city within a minute. A stand-in the photo job wrote would wait for the
     row's next look, 30–33 days later; read, it shows as soon as the landmark is found;
   - the photo row stays `satellite` and the photo job keeps looking on its own schedule: a photo the city gets later,
     or the operator's (`PUT …/photo`), wins on the next answer with no new guard;
   - caching: the photos route sends no ETag and no revalidation (the landmarks route's ETag is unchanged), and a
     phone keeps a photo or a satellite view for twelve hours in memory, until the app restarts. So a stand-in reaches
     a phone within twelve hours of its landmark, and leaves it — skipped, the flag turned off, the city's own photo
     found or the operator's set — within twelve hours too: the server answers differently within ~35 s, phones that
     already hold the stand-in keep it until their entry ages or the app restarts. A takedown faster than that needs the
     photos route to revalidate, an app change outside this amendment. A photograph Commons deletes is not taken down
     by the deletion: the landmark's row keeps its address until the job's next look (30–33 days) and the route keeps
     answering it; a phone that has shown it keeps drawing it from its image cache (`Photo` keeps a photograph on disk
     under its address, across restarts), and only a phone that never loaded it shows the slot's fallback (the club's
     image, or the light tint). The operator takes it down as any stand-in — its item in `skip`, or the club's photo —
     and the twelve hours hold, the address having changed;
   - cost: the flag (cached 30 s), read only when a city asked is on its satellite view, and with the flag on one
     `DISTINCT ON` read of `place_landmarks` for those cities, however many — none while the flag is off
     (`query-budget.test.ts`: five satellite cities with landmarks cost one query more than with the flag off, and no
     more than one).

   The 500-px address is derived, not asked: of the 249 files Commons answered at both widths in this measurement's
   saved answers, the 200 with a 1280-px thumbnail had exactly the 500-px address the rule derives (the others were
   narrower than 1280, or a TIFF's page, which no landmark is). The destination screen (**The app**, above) shows the
   city photo above the landmarks: when the city photo is a stand-in, its `hero` is the first landmark's `imageUrl`
   that the route does not skip, and that screen leaves it out of the list rather than show one photograph twice —
   whichever of the two a phone refreshed last (each is kept up to twelve hours), the one equal to the photograph
   drawn is the one left out.

2. **The Free Art License** (Commons' `FAL`, "Free Art License 1.3") is accepted as CC BY-SA is. It is a free licence
   that asks for the author and for where to find the licence: the credit names the author and links the photo's
   Commons page, which names the licence; a landmark's credit carries the licence's address too (Commons' `LicenseUrl`,
   `http://artlibre.org/…` read on https as Creative Commons' is). ADR-IMPL-043 gives no reason against it — it refuses
   GFDL for asking its whole text beside the photo; FAL asks for a copy or the place to find one. An author is still
   required. `commonsCredit` is shared, so landmarks accept it too.
3. **A TIFF original whose thumbnails Commons serves as JPEG — weighed and withdrawn.** Accepted at first as a
   photograph (one page, both thumbnails JPEG, `…/lossy-page1-1280px-<name>.tif.jpg`), then withdrawn in review the
   same day: the one TIFF any of the 154 cities had on its item, Venice's, is a space agency's satellite image of the
   lagoon (its credit names the agency; its 500-px thumbnail, looked at once, shows the islands from orbit). Written as
   Venice's city photo, it would have been credited as a photograph and, as a photo of the city's own, kept Venice's
   landmark from standing in. On Commons TIFF originals are mostly scans and
   remote-sensing products; nothing in Commons' answer tells a photograph taken there from either. The city photo stays
   JPEG only, as ADR-IMPL-043 had it; PNG, SVG and GIF stay refused; landmarks stay JPEG only (D7).

**Measured** (25 Oct 2026, 16:55–17:07 UTC, and Venice's landmarks at 17:29–17:32 after the review; the same harness,
outside the repository, with this branch's code). The city items' files came from the first run's saved answers; the
landmarks of the 35 were asked again live — GET only, one request at a time, WDQS at least 2 s apart, Commons at least
60 s apart, every Retry-After waited out — until Commons answered 429 three times in a row (17:07), where the etiquette
stops a run; Venice's were asked alone afterwards (two 429s, each waited out, then the answer).

|                                                                                                     | cities  | share of 154 |
| --------------------------------------------------------------------------------------------------- | ------- | ------------ |
| a photo before                                                                                      | 118     | 76.6 %       |
| + the Free Art License (DEL, LCA, SEZ)                                                              | 3       |              |
| + a landmark standing in (BHX, VCE, LIS, HKT, CNX, MAA, AYT, LXR, APW)                              | 9       |              |
| **a photo now, measured**                                                                           | **130** | **84.4 %**   |
| the satellite view, measured (DPS, AUH, NAN: no landmark)                                           | 3       |              |
| not measured: their landmarks not asked before the stop (19), or WDQS answered 502 after 30 s (DXB) | 20      |              |
| none: Kyoto (no airport)                                                                            | 1       |              |

The landmarks found for the 35: three for 8 places, two for none, one for 1 (APW), none for 3 (DPS, AUH, NAN); 23 not
asked — the 3 that now have their own photo were asked last, by design, and 20 were cut by the stop. The 9 stand-ins'
licences: CC BY-SA (2.0, 2.5, 3.0, 4.0) 6, CC BY (3.0, 4.0) 2, public domain 1. **Check 3.2 is not yet met:** 130
measured leaves it between 130 and 150 of 154 (84.4–97.4 %); it passes only if 17 of the 20 not measured have a
landmark (9 of the 12 measured had one). The same measurement, outside the repository, can resume with those 20: CHC,
PPT, POM, PLS, MRS, BRS, FLR, RTM, SUB, AMD, TFS, HER, CEB, DVO, GVA, GOA, HRE, PHC, BDQ and DXB.

**Left to the owner** (not in this change). Each option measured on the 23 cities still on the satellite view — 20 of
them not yet measured for a landmark, so each count is the most it can add:

- **The 1280-px rule** (a city photo wider than 1280 px, so both widths are real thumbnails): 13 cities have a file
  whose only fault is its width — exactly 1280 px for AUH, PPT and CEB (the original would be the hero), 1000–1215 for
  2, 800–904 for 6, under 800 for 2. Accepting the original at 1280 adds at most 3; at 1000, 5; at 800, 11.
- **The panorama band** (1.2 to 2.4 wide for 1): 7 cities have a file whose only fault is being wider — up to 2.5 for
  DXB and RTM (2.42, 2.47), 2.92 for HER, 3.28–3.79 for MRS, FLR, GVA and GOA. 2.5 adds at most 2; 3.0, 3; 4.2, 7. The
  app's photo band would crop them.
- **Portraits** (TFS 1.0, PHC 0.56 wide for 1): 2 cities, only with the app cropping (as for the portrait icons above).
- **A stand-in for a city not looked up yet** (`none`): about a minute of a landmark's photograph in place of the club's
  image, for the cost above (a city's own photo hidden for up to twelve hours); it adds no city to check 3.2.
- Nothing here rescues DPS (its one file has no author, and is 1071 px wide), PLS (a 324-px PNG) or BRS (no file on
  its city item): the club's own photo (`PUT …/photo`) does.

**Tests.** `tests/unit/place-photos.test.ts` (the Free Art License with an author, never without; a one-page TIFF with
JPEG thumbnails, shaped as Commons answers, refused, as are PNG, SVG and GIF; a file's page and its 500-px thumbnail; a
stand-in's photo and credit, only for a satellite view — any photo of the city's own first, a city not looked up yet
left `none`, an unreadable one left out), `tests/unit/landmarks.test.ts` (FAL with its https address; the credit line
read back), `tests/contract/place-landmarks.test.ts` (the stand-in through the route: the flag off, none found yet,
the first landmark, a pending city with landmarks still `none`, a skipped one and all three skipped, a Commons photo and
the operator's first, the rows never written), `apps/api/test/catalog-landmarks.test.ts` (through the host),
`apps/api/test/query-budget.test.ts` (one read for the stand-ins, however many cities; none with the flag off).
