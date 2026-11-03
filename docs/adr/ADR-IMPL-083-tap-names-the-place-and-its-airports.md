# ADR-IMPL-083 — A tap on the globe names the place and offers its airports

> Amended by ADR-IMPL-086 (3 Nov 2026): GeoNames' credit stands in Settings, not on the card under the airports.

Status: proposed · Date: 2026-11-02 · Scope: `packages/shared` (`PlacesNearVM`, `NearAirportVM`, `NearLocalityVM` and
their limits in `api/v1/fares.ts`), `packages/db` (`catalog.localities`, its migration, `seeds/localities-reference.tsv`,
`scripts/localities-reference.ts`, migrate.ts, the test template's hash), `catalog` (`GET /v1/places/near`,
`application/places-near.ts`, `infrastructure/localities.repo.ts`, `airportsRef.near`), `packages/ui` (`AirportRow`'s
`distance`), the app (`features/globe/places-near-logic.ts`, `TapPlaces.tsx`, Explore, `lib/api.ts`),
`design/components.md`, `infra/RUNBOOK.md`, `docs/store` · Amends ADR-IMPL-068 (decisions 1 and 4) · Owner's decision,
2 Nov 2026.

**Context.** ADR-IMPL-068 made a tap anywhere on Explore's globe open the nearest city the club sells — the site's 153
cities and its US origins — within 600 km, and answer `No destination near there.` elsewhere: 73 % of the habitable land
far from Europe got that answer. The owner asked for the member to tap where they need to go and find the town and the
airport they need. His choices (2 Nov 2026): **any airport** with scheduled service, priced as a search prices it (a
published fare, the site's price, the formula, else `Request a quote` — the agent arranges the trip by phone); the
town's name from **an offline list on the club's server**; **a card with three airports**.

**Decision.**

1. **The towns: GeoNames on the server.** `catalog.localities` holds GeoNames' populated places of 5,000 people or more
   (46,547; sections of a city and historical places left out — `seeds/NOTICE.md`), by GeoNames' id, from the file
   `seeds/localities-reference.tsv` (2.1 MB; built from `all-the-cities` 3.1.0, GeoNames' `cities1000` with the
   population). migrate.ts loads it on every deploy and skips it while the table holds as many rows as the file;
   `--localities` compares every row. GeoNames is CC BY 4.0: the card credits it. No outside service is asked at a tap:
   Mapbox's geocoding was declined (the point would leave for Mapbox, a cost per tap, and the account refuses the
   satellite tiles today, ADR-IMPL-082).
2. **`GET /v1/places/near?lat=&lng=`** (`fares:read`, rate rule `read`): the town that names the spot and the airports
   near it. The town: of those within 50 km (one read of the point's latitude band on `localities_lat`, the nearest 40),
   the best `townScore` — the distance over 1 + log10(population / 5,000) — so a tap on a city's streets is the city's,
   not a suburb's whose centre is nearer (ties: the larger, then the name). The airports: every airport with scheduled
   service (`catalog.airports`, the reference of ADR-IMPL-036) within 600 km, nearest first, at most six, from the
   airports each process holds (ADR-IMPL-075) — no read. A point that is not one (`lat` past ±90, `lng` past ±540, not
   decimal degrees) is a 400; a longitude past ±180 (a globe turned past the antimeridian) is brought back. Off
   (`catalog.globe_tap`, as ADR-IMPL-068): `{ locality: null, airports: [] }`, nothing read. `PlacesNearVM` drops an
   airport this app cannot read, never the answer; the town is null when it cannot be read.
3. **What leaves the phone.** The point, rounded to two decimals (about a kilometre: `pointToAsk`), as a query parameter
   — not the device's location, which the app never reads, but a place the member chose, like a search; the request log
   keeps the path, never the query; nothing is stored. ADR-IMPL-068 kept the point on the phone; the town's name needs
   the server's list (the owner's choice), so this changes. `docs/store` says so.
4. **The card** (proposed until design draws it): under the search bar where ADR-IMPL-068's answers stand, Search's
   section title naming the place — `Bălţi, Moldova`, `Near Bălţi, Moldova` past 15 km, `Airports near there` with no
   town — over the three nearest airports once the member's home airport and every airport under 100 km from it are
   left out (the server's `SAME_METRO_KM`, as every list), each Search's `AirportRow` (18) with its distance in slate
   before the chevron (`AirportRow`'s new `distance`), then GeoNames' credit. A row opens its airport exactly as a pin's
   tap does (`openCity`, `cityToOpen`: its pin's airport when the city has a pin), so the search prices it and
   `Request a quote` asks for it. Nothing left: the member's own city when the tap fell within its metro (the home
   answer), else `No destination near there.`. It reads out as it appears. The next tap, a choice, Search or every offer
   puts it away; an answer that comes back after another tap is left unread.
5. **Offline, and when the server cannot answer:** ADR-IMPL-068's snap to the nearest city the club sells, from Home's
   `bookable` — the drawn globe still answers a tap without a network. ADR-IMPL-068's decisions 1–3 stand: the flag, and
   Home's list, which also decides whether the globe takes a tap at all.

**Consequences.**

- A tap anywhere on land near an airport gets an answer — a member in Chișinău who taps Bălți is offered Iași (70 km),
  Suceava (120 km) and Bacău (160 km), Chișinău being home; a city the club does not sell is a quote the agent prices.
- One request a tap (the point's band: tens to a few thousand rows' distances, about a millisecond; measured in the
  test database) and about 2 KB back; no new job, no new flag.
- The repository grows by 2.1 MB (about 1 MB compressed); each test database copies 46,547 rows from the template; a
  fresh database's first migrate writes them (seconds).
- The town's name is GeoNames' (`Chisinau`, and `Bălţi` with the cedilla GeoNames writes); a wrong one is
  corrected in the file and loaded with `--localities`.
