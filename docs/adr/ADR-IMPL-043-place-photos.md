# ADR-IMPL-043 — A photograph for every city, without storing one

Status: accepted · Date: 2026-10-09

**Context.** Figma draws a destination's photograph on the offer cards (89:386, 89:389), on an offer's fare page
(135:846, `Proposal / DestinationPhoto`) and behind the member's name on Profile (233:4453, `Proposal / ProfileHero`,
436:1221). The app had no source for them: cards were grey plates, an offer's page fell back to the plain layout
unless the operator gave the offer a picture, and Profile showed a monogram card (ADR-IMPL-041 left it out). The club
flies to thousands of cities; a curated library cannot cover them, and the owner rejected bundling one (9 Oct 2026).
How others do it: FlixBus's CitySnap picks free photos per city from open sources and checks them before use; OsmAnd
shows the Wikimedia Commons photos that Wikidata links to a place, fetched when needed, credited where shown. Unsplash
Source was shut down in 2024; Google Places photos may not be cached and carry Google's branding. Approved on 9 Oct
2026: four tiers — Wikimedia Commons through Wikidata, then Pexels, then Mapbox's satellite view, then the club's own
image.

**Decision.**

- **Addresses, never images** — `catalog.place_photos` holds, per airport the app asked about, the addresses of a
  photograph hosted elsewhere (a card's width and a full width), its credit (author, licence, the photo's page) or the
  point a satellite view is centred on. Phones load the photograph from Wikimedia or Pexels directly. The table is
  created by a named step, `0026_catalog_place_photos.sql`, after the catalog schema (0006): the drizzle migrator runs
  first and would not find `catalog.airports`; a no-op `20261009095042_snapshot_sync` brings drizzle's snapshot level.
  CHECKs: a source exactly when there is a photo; a photo has both widths and its page unless an operator chose it; a
  satellite view has a point on Earth; every address is https; `attempts >= 0`. An airport removed takes its row.
- **Asked for when shown** — `GET /v1/places/photos?codes=` (1–20 IATA codes, `fares:read`, rate rule `read`) answers
  from the table at once: `photo` (`card`, `hero`, `credit`), `satellite` (`lat`, `lng`) or `none` (not looked up yet).
  A known airport never asked about gets a `pending` row in the same request (one insert from `catalog.airports`; a
  row another request added a moment ago comes back unchanged, so it is answered too); an unknown code is left out. Two queries in steady state, three when a city is new, however many
  codes (`query-budget.test.ts`). The contract (`packages/shared/src/api/v1/places.ts`, a change to shared this ADR covers)
  drops an item an app cannot read — a later kind, an address that is not https — never the whole answer.
- **Looked up by a job, ten cities a minute** — `resolve-place-photos` (worker, every minute, singleton, 50 s) claims
  up to ten due rows, new ones first (`FOR UPDATE SKIP LOCKED`, held ten minutes so a run that dies leaves them to the
  next), and for each city in turn:
  1. **Wikidata** (one SPARQL question for the run): the items with the IATA code (P238); ours is the one within 50 km
     of our coordinates (P625) — a code reused elsewhere, or none near, gives nothing. The city it serves (P931): the
     one whose English name is the city we show, else the oldest item. Its night view (P3451) first, then its main
     image (P18), files named as a montage, map, flag or coat of arms left out, three at most.
  2. **Commons** (two questions for the run, at 1280 and 500 px — two of Wikimedia's standard thumbnail widths; it
     refuses or slows others): the first file that is a JPEG in landscape (1.2–2.4 wide for 1 high), wider than 1280 px
     (so both widths are real thumbnails, never the original), under CC0, public domain or CC BY / BY-SA, without
     restrictions (personality rights, trademarks), with an author when the licence asks for one. The credit is its
     Artist and LicenseShortName as text (80 characters at most) and its Commons page.
  3. **Pexels**, only with `PEXELS_API_KEY` and three cities a run at most (60 runs an hour stay under Pexels' 200; its
     month allows 20,000): `<city> skyline`, landscape; the first photo whose description names the city and no person
     (Pexels answers every search with something, and people are not the club's material). Credit: the photographer,
     `Pexels License`, the photo's page. A city past the run's three is `deferred` — due again at once, the look not
     counted. A key Pexels refuses (401) counts as none for the run: a city that shows a photo keeps it, one without
     gets its satellite view for a day, and the log has an error for an operator to replace the key. A 403 may come
     from the network in front of Pexels: it counts as down.
  4. **Satellite**: the city's centre from Wikidata when it lies within 150 km of the airport, else the airport.
- **Politely, and never downgraded** — the club's User-Agent goes with every request
  (`BBCClub/1.0 (<APP_ORIGIN>; place photos)`, Wikimedia's policy), eight seconds each. A source that fails (an error,
  a timeout, a shape other than its documentation's — Commons' own errors come with HTTP 200 and no pages, and count as
  failures) leaves the row as it was and tries again after
  `least(attempts, 24)` hours — a city keeps the photo it has, and is never downgraded to a satellite view because a
  server was down; a row the database refuses is tried again the same way, without holding the others. Every resolved
  row is looked at again after 30 days, spread over three more.
- **The club's own photo** — `PUT /v1/internal/places/:code/photo` (`catalog:import`, the internal secret) sets two
  https addresses and the credit if the photo needs one; it never expires and no job write touches it (each carries
  `source IS DISTINCT FROM 'override'`). `DELETE` hands the city back to the job. For a wrong or poor photo; the RUNBOOK
  has the command.
- **Off** — flag row `catalog.place_photos` (seeded `{ "enabled": true }`): off, the route answers `{ "items": [] }` and
  the job asks nothing outside; the app shows its own image everywhere.
- **The app** — cards (`OfferCard`): the offer's own picture, else the city's photo at 500 px, else the club's image
  (`cabin.webp`) — a card never shows a satellite view. An offer's fare page (135:846) always has its photo band now:
  the offer's picture, else the city's photo at full width, else its satellite view, else the club's image; a search
  fare's page has none (135:845) and does not ask. Profile (233:4453): `ProfileHero` (new in `packages/ui`) — the home
  city's photo or satellite view under a flat 32 % `surface-night` scrim, the name in `headline`, `Flies from JFK` on
  a white pill — then `Edit` and `Call us` as two white pills 48 pt high, 12 pt apart (479:8388). A photo that cannot
  load shows the club's image (`Photo`, new in `packages/ui`: `surface-muted` while it loads, never a spinner). The
  photos are asked once a session for up to twenty cities a question, shared by every screen; a city not looked up yet
  is asked again each minute while shown, a code the server left out after an hour (`place-photo-store.ts`). What the
  app knows is an immutable snapshot read through `useSyncExternalStore`, so a screen the React Compiler memoised
  draws the photo when it arrives. Pictures from Wikimedia carry
  `BBCClub/<version> (<API URL>; app)` as their User-Agent: Wikimedia answers Android's default one with 403.
- **Credits** — where a photo is shown full width, a caption line under it opens the photo's page:
  `Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons`, `Photo: Ana Pop · Pexels`, the operator's words for the
  club's own photo (none when it needs none), `Imagery © Mapbox © OpenStreetMap © Maxar` for a satellite view (drawn
  with `attribution=false&logo=false`, which the Static Images API allows when the attribution is written beside the
  image). A card's photo is credited on the fare page it opens. A satellite view is kept in memory only.

**Consequences.** New cities show the club's image for a minute or two, then their photo. The worker reaches
`query.wikidata.org`, `commons.wikimedia.org` and `api.pexels.com`; phones reach `upload.wikimedia.org` (or Wikimedia's
newer thumbnail host), `images.pexels.com` and `api.mapbox.com` (the Static Images API, billed per request beyond its
free tier, with the same `pk.` token). Metrics `bbc_place_photos_resolved{status,source}`,
`bbc_place_photos_failed{stage}`, `bbc_place_photos_requested`. Tests: `tests/unit/place-photos.test.ts` (reading each
source, choosing, refusing, the credit, the contract), `tests/contract/place-photos.test.ts` (the route, the job, the
operator's photo, a source down, the flag, the CHECKs), `apps/api/test/query-budget.test.ts`, the app's
`place-photo-logic.test.ts` and `place-photo-store.test.ts`.

**Deviations, reported (owner's decision).**

- `design/components.md` (Photography): _"never landmarks… postcards"_. Commons' and Pexels' city photographs are
  often a skyline or a landmark; the night view comes first for its restrained light. The club's own photo
  (`PUT …/photo`) replaces any city's.
- Figma 436:1221's description: _"Bundled content, not backend photography"_. The approved chain replaces bundling.
- `DESIGN.md`: _"Shape is meaning: pills act"_; Figma's `Flies from JFK` pill does not act. Drawn as Figma draws it.
- `DESIGN.md`: _"secondary actions are text-link, never buttons"_; Figma 479:8388 draws `Edit` and `Call us` as white
  pills. Drawn as Figma draws them (as A2c drew `Call your specialist`).
- Figma has no credit line; the licences ask for one (CC BY: "in any reasonable manner"; Mapbox: "near the image").
  It sits under the photo in a 44 pt row (a text link's hit area), its line in the middle: 13 pt above and below the
  line, 44 pt between the photo and what follows instead of Figma's 24.
- An offer without its own picture now shows the offer frame (135:846: the photo band, then
  `A specialist arranges everything by phone.`) instead of the search frame it fell back to.

**Rejected.** A library of bundled photos — cannot cover the cities the club flies to. Storing the images (MinIO) —
nothing creates its bucket or backs it up yet (ADR-IMPL-010), and hotlinking is what both sources expect. Google
Places photos — no caching, Google's branding. Unsplash — its API asks for hotlinking with tracked downloads, and
Source is gone. Looking photos up in the request — a member's screen would wait on Wikidata.

**Residual risk, accepted.** A Commons photo can be deleted or renamed: its address fails until the next look (at
most 33 days) and the app shows the club's image meanwhile. Wikimedia may slow or refuse thumbnails it treats as bot
traffic; the User-Agent and the standard widths are what it asks for. A card whose offer has no fare opens a request,
not a fare page: its photo is shown there without a credit.
