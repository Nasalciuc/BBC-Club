# domain/catalog

**Owns:** schema `catalog.*` — `fares` (route/cabin/price catalogue) and `airports` (IATA reference for pins + autocomplete). Airports have `created_at`; fares `updated_at` trigger is `trg_updated_at` (db:verify extras `0007_catalog_verify_fitness.sql`).
**Publishes:** none.
**Consumes:** none.
**Ports:** none (`needs: []`). Repository surface is the port — a Sabre / company-API adapter can replace `fares.repo` later without route changes.
**Facade:** `searchFares`, `getFare`, `destinations`, `searchAirports`, `getAirport`, `importCsv`.
**Routes:** `GET /v1/search`, `GET /v1/fares/:id` (410 if past `valid_until` or unpublished), `GET /v1/airports?q=` (max 8), `POST /v1/internal/catalog/import` (`catalog:import`).
**Jobs:** `expire-fares` every 15 minutes — sets `published = false` where `valid_until < now()`.
**Out of scope:** promotional offers (`proposals.offers`), Sabre adapter, mobile wiring.
**Invariants tested:** search JFK→LHR business → ≥3 · expired fare → 410 · airports `q=JF` ranks JFK · import idempotent · unauthenticated → 401.
