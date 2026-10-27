-- ADR-IMPL-077: "Popular from" reads one origin's searches of the last seven days (`discoveryRepo.searchedFrom`).
-- The primary key starts with the day, so that read walked every route of every day in the window and kept one
-- origin's: equality first, then the range. CONCURRENTLY: applied outside a transaction by migrate.ts, so the nightly
-- rollup keeps writing while it builds. The Drizzle snapshot is brought level by a no-op sync migration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS demand_daily_from_day ON catalog.demand_daily (route_from, day);
