# ADR-IMPL-036 — Airport reference data and search

Status: accepted · Date: 2026-10-06

**Context.** Members could find only 81 curated airports in staging, and in production only the airports the company's
catalogue import brings with its fares. Search was a prefix and substring match: no typos ("Lodon"), no accents
("Chișinău", "Zürich"), no countries ("Japan"), no nicknames ("UK", "NYC"), no city served (Narita sits in Narita but
serves Tokyo). A member who cannot find a city cannot ask for a quote to it.

**Decision.**

- **Reference set** — `packages/db/seeds/airports-reference.tsv`: 3,860 airports with scheduled service and an IATA
  code. OurAirports (public domain) for codes, names, coordinates, countries and keywords; mwgg/Airports (MIT) for the
  city served and the IANA time zone. Airports with no reliable zone (several zones in the country, none known) are left
  out: a wrong zone shows wrong flight times. `search_terms` keeps metro and former codes and other names (LON, TYO,
  KIV for Chișinău's RMO, New York City for Newark). Popularity: the curated hubs keep their curated value (40–100);
  every other airport stays below 40 — large 30, medium 15, small 5, plus 5 when its name says International. Regions
  follow the country, as the curated seed does (Turkey and Hawaii included), with a Middle East list.
  Sources and licences: `seeds/NOTICE.md`.
- **Loading** — `scripts/airports-reference.ts`, the last step of `migrate.ts`, on every deploy. It inserts the airports
  that are missing (`ON CONFLICT DO NOTHING`) and fills `search_terms` where an existing row has none — the curated seed
  and the catalogue import never set it, so without this "Tokyo" would not find an imported Narita. Nothing else on an
  existing row is touched. The file is tab-separated (names contain commas and quotes), LF in git (`.gitattributes`),
  parsed so that an empty last field survives and a Windows checkout reads the same. The test template's hash includes
  it.
- **Schema** — `0023_catalog_airports_search.sql`, a named step after `0006_catalog.sql` (an `*extras*` file runs before
  0006 and would not find `catalog.airports` on a fresh database): `pg_trgm`, `unaccent`, `search_terms`, and four
  lower-case, accent-free copies (`city_norm`, `name_norm`, `country_norm`, `terms_norm`) written by the
  `airports_normalize` trigger and indexed with trigram GIN indexes. Declared in the Drizzle schema (schema parity);
  `AirportRow` leaves them out — they are internal to search. Not a drizzle-generated migration: the drizzle snapshot
  lacks the objects 0021 and 0022 created, so `drizzle-kit generate` emits a migration that recreates them and would
  fail on any existing database.
- **Search** — `airports.repo.ts`, in tiers: a country nickname (UK, USA, UAE) means the country first; then exact
  code, code prefix, exact city, city prefix, country, other names, text anywhere, and — from four letters — a close
  spelling, whose candidates come from the trigram indexes (`%` on the city, then similarity above 0.35; `<%` on the
  name, at pg_trgm's default word threshold). In the first six tiers the busiest airport leads; in the last two, the
  closest spelling. The typed text is normalised once per query (scalar subqueries) and matched literally (`%`, `_` and
  `\` are escaped). Eight results, as before; same response shape; same query budget.
- **Speed** — measured on 3,860 airports, uncached: computing `unaccent` per row per search cost 30–80 ms; with the
  trigger-maintained columns and index-picked candidates, 10–21 ms (median, sandbox CPU). Results stay cached 60 s.

**Tests.** The dataset (codes, zones, regions, coordinates, popularity against the curated seed, served cities and
search terms); the parser's edge cases; the loader on a real database (no double insert, terms filled without touching
city or popularity, existing terms kept, a deleted airport restored); seventeen search expectations in
`apps/api/test/catalog.test.ts`, including `%` and `_`; a fresh and a repeated migration; schema parity. Test inserts into `catalog.airports` now overwrite their own columns instead of assuming an empty
table.

**Costs.** ~0.4 MB of data in the repository and the image; four short text columns and three small GIN indexes on
~3,900 rows. Production and staging receive the set on their next API deploy.

**Rejected.** OpenFlights (ODbL, share-alike), Google Places autocomplete (per-request cost, caching limits, latency),
shipping the list to the app (0.4 MB per install, no server ranking), a drizzle migration (above).

**Follow-up, outside this change.** Bring the drizzle snapshot back in line with the extras-created objects, and add a
CI check that `drizzle-kit generate` produces nothing on a clean tree (infrastructure PR).
