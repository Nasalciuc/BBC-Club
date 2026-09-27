# domain/catalog

**Owns:** schema `catalog.*` — `fares` (route/cabin/price catalogue) and `airports` (IATA reference for pins + autocomplete).
**Publishes:** none.
**Consumes:** none.
**Ports:** none (`needs: []`). Repository surface is the port — a Sabre / company-API adapter can replace `fares.repo` later without route changes.
**Facade:** `searchFares` (at most 30), `getFare`, `destinations`, `searchAirports`, `getAirport`, `getAirports`, `importCsv`.
**Routes:** `GET /v1/search`, `GET /v1/fares/:id` (410 if past `valid_until` or unpublished), `GET /v1/airports?q=` (max 8), `POST /v1/internal/catalog/import` (`catalog:import`).
**Jobs:** `expire-fares` every 15 minutes — sets `published = false` where `valid_until < now()`, then clears the destinations cache.
**Home map:** `destinations()` is `DISTINCT ON (route_to)` ordered by price, cached 60s per airport outside a caller transaction. A fare that expires mid-minute can stay on the map for ≤ 60s; its detail answers 410. Import and expire-fares clear the cache.
**Out of scope:** promotional offers (`proposals.offers`), Sabre adapter, mobile wiring.
**Invariants tested:** search JFK→LHR business → ≥3 · expired fare → 410 · airports `q=JF` ranks JFK · import idempotent · unauthenticated → 401 · timed fixture `arrive − depart == duration` · fa01 maps to 18:55 / 07:00 / +1 · same clocks under Europe/Chisinau and America/Los_Angeles · every `airports.csv` `tz` is IANA.
