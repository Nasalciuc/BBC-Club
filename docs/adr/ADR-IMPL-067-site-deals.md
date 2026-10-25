# ADR-IMPL-067 — Site deals: the company site's deals in Explore's "Offers to inspire"

Status: proposed · Date: 2026-10-25 · Scope: `catalog` (`application/site-deals.ts`, `infrastructure/site.repo.ts`,
`infrastructure/site-prices.repo.ts`, the facade's `siteDeals`, the job `sync-site-destinations`), `packages/db`
(`0042_catalog_site_route_validity.sql`, `20261025145245_snapshot_sync`), `packages/shared` (`HomeVM.deals`,
`SiteDealVM`), `apps/api` (Home's BFF), `apps/mobile` (Explore's offer cards), `packages/ui` (`OfferCard`'s origin
line), `scripts/seed-flags.ts`, `scripts/seed-staging-demo.ts`, `infra/cron/crontab`, `infra/RUNBOOK.md` · Amends
ADR-IMPL-045 (the site's prices, kept and never shown, become a deal's starting price behind a flag; the job runs twice
a day; a snapshot row is served for a day) and ADR-IMPL-040 (a demo offer an operator withdrew stays withdrawn) · Brief
3.1 step 3, decision D6, owner item 3; brief 4.1 item 7.

**Context.**

- **What the site's deals are.** Each of the site's 154 city pages (`/api/bestDeals/getOne?id=<city>`) lists its deals,
  each exactly `{ id, name, price_today, old_price, image, type }`: `name` is a US city ("New York ", trailing space and
  all), `image` and `type` are null on every one. No airport code, no cabin, no trip, no travel dates, no validity, no
  carrier, no time of update. The site's footnote is the only statement of what the numbers are: USD, taxes and fees
  included, per person, "based on business and first class weekday travel … from the USA", "call … for current best
  prices", "subject to change without prior notice". Read on 25 Oct 2026 (154 read-only requests; the answers are kept
  outside the repository, as they hold company prices): 790 deals, 3–12 a city; by origin, New York, Chicago and Los
  Angeles 154 cities each, Miami and San Francisco 100, Washington 98, Boston 5, Denver and San Diego 3, nine more cities
  1–2; Toronto and Vancouver are named once each and match no US airport. Through the club's mapping (ADR-IMPL-045):
  153 cities placed (Kyoto has no airport), 1,439 (US airport, city) routes over 27 US airports.
- **The "Old Price".** Every deal has one beside its "Price Today", and it carries no source per deal — no airline,
  fare class, date or system. A reference price the club prints needs one: DESIGN.md (`Save 48%` only where the
  published fare is on record, its source beside it), `PricePair.publishedSource`, the fares' CHECK, and the FTC's
  guides on former and comparable prices (16 CFR 233.1–233.2), which ask what the reference price was and who charged
  it. The site does not say, per deal. (What the read measured about these prices stays with the private evidence.)
- **Where offers live today.** `proposals.offers`: a broadcast offer becomes a notifications campaign pushed to every
  member (`on-offer-published.ts`); the feed has no origin filter, so a New York member would get Los Angeles' deals;
  a price change under the same idempotency key is a 409, so a nightly change is a withdraw and a new offer — a new id,
  old links 410, states lost, another push; `offer_source` knows `crm_agent | marketing_campaign` only, and an offer has
  no published source, no trip and no origin name; catalog declares `needs: []` and rule 1 allows a call for questions
  only, so catalog cannot ingest offers. ADR-IMPL-045 already rejected "the site's prices as offers" for the first two
  reasons. A catalog fare needs a carrier, times and a sourced published price; the deals have none.

**Decision.**

1. **Catalog-held site deals.** The nightly snapshot the catalog already keeps — `catalog.site_routes`, one row per
   (US airport, site city): the site's deal id, its "Price Today", its "Old Price" — is the deal list. Not broadcast
   offers through `proposals`, not `catalog.fares`. Nothing is pushed, nothing new is written per member, and a deal is
   read by the member's airport.
2. **A day of validity (D6), in Postgres.** `0042_catalog_site_route_validity.sql`, a named step in `migrate.ts` after
   0028, recorded once in `platform.extras_applied`; a no-op `20261025145245_snapshot_sync` brings drizzle's snapshot
   level. `site_routes.valid_until timestamptz NOT NULL DEFAULT (now() + interval '24 hours')` and CHECK
   `site_routes_validity`: `valid_until > synced_at AND valid_until <= synced_at + 24 hours`. The rows already there get
   `synced_at + 24 hours` — their own read's day, so a row read two days ago is expired at once and the next sync writes
   it again — before the default, NOT NULL and the CHECK (drizzle's own `ADD COLUMN … DEFAULT` would have given every
   row the migration's day). The default keeps a binary from before this release writing valid rows during a deploy.
   The sync writes `valid_until = now() + 24 hours` in the transaction that writes `synced_at = now()`. **Every read asks
   `valid_until > now()`**: Home's site pins, `refresh-site-prices`' routes and the deals; the pins and the deals, which
   Home keeps a minute, ask 75 s more (`valid_until > now() + 75 s`): a minute, the 10 % more Redis may keep a key (the
   platform's cache spreads its expiries up to 1.1 × the TTL), and the read's own seconds — so none is served past its
   day while kept. The stored answers the pins read ask the same. A deal the site drops is deleted by the next sync's
   replace (all or nothing, as before); a sync that fails changes nothing, and the deals it leaves expire within the day;
   a city whose own page fails keeps its rows with the day their own read gave them, so it leaves the deals within a day
   too. ADR-IMPL-045's guard — a night that lists or places fewer than 80 % of last night's cities changes nothing —
   weighs a night against the snapshot only while its day has more than an hour to run (`siteRepo.guarding`, the places'
   `synced_at`): the run twelve hours after a good one is refused, the run a day after is not, since what it would keep
   serves nothing from then on. Without that, a site that lastingly drops a fifth of its cities would leave Explore with
   no deal and no site pin for good; with it, they are back a day after the last good read.
3. **Twice a day.** `sync-site-destinations` runs at 07:40 and 19:40 UTC (was 07:40): with a day of validity, a run
   once a day would end each day's deals minutes before the next run wrote its own, and one failed night would empty
   Explore for a day. Twice a day, one failed run leaves the deals twelve more hours. It reads the site when the site's
   photos, its pins **or its deals** are on; with all three off it asks nothing, as before. The pace, the timeout and the
   all-or-nothing rules are ADR-IMPL-062's; the site's API sees about 480 requests a day per environment instead of 240.
4. **Which deals a member sees** — the facade's `siteDeals(exec, home, limit)` (`application/site-deals.ts`, pure):
   - the site's origins as **metros**: the ones the site names with several airports (`SITE_ORIGIN_AIRPORTS`: New York
     JFK, EWR, LGA; Washington IAD, DCA, BWI; Chicago; Houston; Dallas), each called by the site's name for it ("New
     York", "Washington" — not Newark or Baltimore); any other origin is its own airport, called by its city;
   - the member's own metro first (their airport, or a metro it belongs to), then every other by great-circle distance
     from their airport to the metro's nearest airport — so a home the site sells nothing from (Seattle, Toronto,
     Chișinău) gets the nearest city's deals first, and a home with a few (Boston 5, Denver 3) gets its own, then the
     nearest others';
   - each metro's deals in the pins' order (the site's home page first, then the destination's traffic, then its code),
     each city's from the metro's preferred airport (the member's own, then the metro's list order);
   - **one deal per destination city** — any airport of it — the nearest origin's (so also none twice for one origin),
     never the member's own city (one of its airports, or one under 100 km from home), at most `limit`.
     Each deal: `id` `site-<deal>-<airport>`, the destination as an airport (as a pin is) with its city's place photo
     when `catalog.place_photos` is on and it has one (the photo and credit `/v1/places/photos` serves), the origin
     `{ code, city }`, the price, `validUntil`; for the BFF also every airport of the city and of the origin's metro.
     Reads: the home airport and the origins (one grouped query, about 27 rows), then one query for the nearest metros'
     deals — one more only when their deals overlap past what they hold. Measured on Home (the API's test fixture, a
     New York member): with every cache cold, 12 queries with the deals on against 8 without (the flag's read, then the
     three); with the flags kept, a home whose deals' minute has turned costs those three reads; 4 against 4 while the
     deals are kept. Cached a minute like the site's pins (`catalog:deals:{gen}:{HOME}:{limit}:{photos}`
     with the pins' generation, which the sync bumps; a process cache without Redis); with an executor, read now.
5. **The flag** `catalog.site_offers`, `{ enabled: false }`, seeded off by `scripts/seed-flags.ts`; off, `siteDeals`
   answers none without a query and Home is exactly what it was, its ETag included. **It needs neither
   `catalog.site_pins` nor `catalog.estimates`**: a deal carries the site's own price, not the formula's, so it does not
   wait for the formula's approval (estimates are off in production until the company's written approval, ADR-IMPL-037);
   the pins need a price from the formula or the site's search, and a deal is not one. The job reads the site for either.
6. **The contract** (`packages/shared`, AGENTS rule 9: this ADR). `SiteDealVM`: `id`, `destination` (`AirportVM` with
   `photo: { card, hero, credit } | null`, a photo it cannot read reading as none), `origin { code, city }`, `price
{ amount: whole USD > 0, currency: "USD", basis: "site", from: true }`, `validUntil`. **No `published`, no saving, no
   field for the "Old Price" at all**: the catalog does not read it for a deal, the view model has nowhere to put it, and
   a test proves a server that added one beside the price reaches no card. `HomeVM` gains `deals`, optional both ways:
   an app built before it strips it (zod's default), a Home without it parses as none, and `.catch(undefined)` on the
   list — inside it, a deal the app cannot read is left out without the others (as `PlacePhotosVM` does).
7. **What the card prints.** The site gives no trip and no cabin, so the card prints neither: the city, its country,
   `from` and the price — `from $X` is the site's starting price, per person, indicative, as its footnote says ("call
   for current best prices"); the specialist confirms the fare by phone. The card prints neither `per person` nor
   `indicative`, though the site states both: no price card in the club says `per person` (an offer's `from $X`, a
   pin's, a fare's are one traveler's too, and 02 and 16 draw no such word), so the deals alone saying it would read as
   if the offers beside them were for something else; and no card says `indicative` (the destination's sheet a tap opens
   does: `Indicative · your specialist confirms the fare.`). Reported below, for the owner and the designer. No `Save`
   bar, ever (DESIGN.md's Save rule, and no source). When the deal leaves from another city than the member's — not
   their airport and not their city — a line under the price names it: `from New York`, in the country's role
   (`offerCountry` / `offerSmCountry`) and slate, as far below the price as the country is below the city; it wraps
   rather than cut (`from San Francisco` at the reading size). A screen reader hears the city, the country, `from $X`,
   `from New York`.
8. **Home's BFF.** "Offers to inspire" is the member's own offers (the inspire section, as before: the first six of
   their feed), then up to 24 site deals (`SITE_DEALS_SHOWN`: twice the pre-registered floor of twelve, a row a thumb
   still scrolls, about 12 KB) in `HomeVM.deals`. **The cap does not meet the pre-registered check "3.1 offers" as it is
   worded** — "Explore lists every live site deal the member's region can see" — for a home with more than 24 (153 for
   New York, every home in the table below): Explore lists at most 24 of them. The rest of the check holds: at least 12
   where the site has 12, no city twice for one origin, an offer from another city names it, and each deal has its
   source, origin and validity. Every deal needs either a Home about five times larger and a row that mounts only the
   cards on screen (`CarouselRow` is a `ScrollView`: each card mounts, and each photo is asked, at once), or a `See all`
   over the deals with a read of its own; the owner decides that, or amends the check to a stated cap. Until then 3.1 is
   not reported as passed. A deal to a city one of the member's offers already goes to from the same metro is left out —
   any offer Home reads, not only the inspiring six: the others stand in their region's row under the deals (16) — so no
   city shows twice for one origin, the demo's Tokyo and the site's Tokyo included. The cap comes after that: Home asks
   the catalog for 24 deals and one more per offer it reads (50), since an offer takes at most one deal off (one deal
   per city), so a member's own offers never leave them fewer than 24 where the site has them. `deals` is absent when
   there is none. The ETag is the body's, whole, so a price, a day or an origin that changes makes a new one.
9. **The app.** Explore's rest row (02) and the raised sheet's row (16) draw the deals after the offers, as `OfferCard`s
   (`explore.deal.<id>`); `No offers yet.` only when there is neither. A deal has no page of its own: a tap chooses its
   destination as a pin does (`selectDestination`: the route's sheet, its search from the member's airport). The
   picture: the design's photo of the city on an offer, else the photo the deal carries, else the place photos'. The
   app reads `validUntil` too: Home is read once, when Explore mounts, and a phone can keep the app a day in the
   background — when it comes back to the foreground, the deals past their day leave the Home it holds at once (with
   no network as well) and Home is read again (`withLiveDeals`, `useExploreHome`).
10. **Staging's demo** (brief 4.1 item 7). The demo seed keeps a demo offer an operator withdrew withdrawn — its upsert
    no longer sets a withdrawn row back to active — and writes no inbox item for it; a run twice is the same rows. Once
    the deals are on in staging, the RUNBOOK's step withdraws the demo's Paris and Tokyo through the internal route
    (`offer.withdrawn` closes what their consumers hold), and no later deploy brings them back.

**Measured** — the read of 25 Oct as a recorded fixture (`tests/unit/site-recorded.json`: its structure, every price
made up from the deal's id), through the real sync and `siteDeals` (limit 1,000, then Home's 24):

| Home                                             | Deals | From                                                                    | Home's 24                |
| ------------------------------------------------ | ----- | ----------------------------------------------------------------------- | ------------------------ |
| JFK, EWR, LGA; HPN (White Plains, not an origin) | 153   | New York 153 (HPN: named)                                               | New York                 |
| ORD · LAX                                        | 153   | Chicago 153 · Los Angeles 153                                           | own                      |
| MIA · SFO                                        | 153   | Miami 99, New York 54 · San Francisco 99, Los Angeles 54                | own                      |
| IAD, BWI                                         | 153   | Washington 97, New York 56                                              | Washington               |
| BOS                                              | 153   | Boston 5, New York 148                                                  | Boston 5, New York 19    |
| DEN                                              | 153   | Denver 3, Phoenix 2, Dallas 2, San Diego 1, Los Angeles 145             | the same, Los Angeles 16 |
| SEA, YVR, HNL                                    | 153   | San Francisco 99, Los Angeles 54                                        | San Francisco            |
| YYZ (Toronto)                                    | 153   | Washington 97 (Baltimore is 557 km away, Philadelphia 558), New York 56 | Washington               |
| RMO (Chișinău)                                   | 153   | Boston 5, New York 148                                                  | Boston 5, New York 19    |

No city twice; every deal has its source (`basis: "site"`, the site's deal id), its origin and a day of validity.

**Rejected.** Broadcast offers through `proposals` (above; the "if the owner still wants it" path — an `offer_source`
`site`, a feed by origin, a no-push marker on the event, keys per price with withdrawals — is a schema or contract
change at every step). Catalog fares (above). Only the member's own metro's deals, nothing from elsewhere: Boston would
see 5, Denver 3, Seattle none — under the floor of twelve the brief sets. Every deal of the member's region on Home (153
for New York) — which check 3.1's wording asks for (§8): 60 KB of Home, and a row that mounts 153 cards and asks their
photos at once; the cap is one constant, and the owner's call. A deal page of its own: the site gives nothing a page
could hold that the destination's does not. Showing the "Old Price" with the site as its source: a source must say who
published that fare and when; "the company's site" says neither.

**Consequences.**

- Nothing changes until an operator turns `catalog.site_offers` on (off everywhere). Then Explore shows the site's
  deals after the member's offers, and the site is read twice a day.
- With the flag off the job still writes `valid_until`, the pins and `refresh-site-prices` still read only rows within
  their day: a site that has not answered for a day leaves no site pin either (D6 for the city list as for the price).
  After this migration, an environment whose last good night is older than a day shows no site pin until the next
  successful run.
- Home costs three more reads with the flag on when a home's deals are not kept (the flag's own read too when the
  flags' cache is cold, and a second read of the deals when the nearest metros overlap), none while they are kept
  (measured in §4); `query-budget.test.ts` holds it: two reads of `site_routes` on a miss, none kept, and at most four
  over Home without the deals.

**Deviations, reported (owner's decision).**

- DESIGN.md's Product Content: "a fare says what its price covers (`one way` until the catalogue says `round trip`)".
  The site's deals say no trip, so the card cannot say what the price covers, and printing `one way` would be a claim
  the site does not make. The card says `from $X` and nothing about the trip.
- DESIGN.md's "a fare says what its price covers", beyond the trip: the site does state `per person` and `indicative`,
  and the card prints neither (§7: no price card in the club says either). For the owner and the designer together:
  whether a deal card — or every price card — should print `per person`, and whether a deal should carry an
  indicative mark like the estimates' `INDICATIVE FARE`; 02 and 16 draw room for neither, so either is a new line.
- design/components.md's OfferCard (02, 16) draws no origin line. The deals need one (the brief: "an offer that leaves
  from another city than the member's home says so"); it is drawn with the card's own country role and colour.

**Left to the owner.**

- **Ask the company**, per deal: the trip (one way or round trip), the cabin (business only, or first too), the travel
  dates or season, and how long a price holds. With them the card can say what its price covers.
- **The "Old Price"**: with, per deal, the airline, the fare or booking class and the day the published fare was
  recorded (and where), `Save X%` could be shown with its source (`BA published · 16 Sep`). Until then it is stored and
  never served.
- Whether "from New York" should also make the search start from New York (today a tap opens the destination from the
  member's own airport, as a pin does — so the sheet shows the club's price for that route, not the deal's, and the
  two can differ).
- The cap of 24 deals on Home (`SITE_DEALS_SHOWN`) against check 3.1's "every live site deal" (§8): every deal (a
  larger Home and a row that mounts what is on screen, or a `See all` with its own read), or the check amended to the
  cap. And whether region carousels should carry deals too (they carry offers only).
