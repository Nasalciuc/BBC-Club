# ADR-IMPL-013 — Fourteen findings: contracts, flags, graph shape

Status: accepted · Date: 2026-09-18 · Supersedes nothing; amends ADR-IMPL-009 (rules as build failures) and ADR-IMPL-012 (handler contract). `packages/shared`, `eslint.config.mjs`, and PORT/env are ADR-gated.

**Context.** After PR #32 the host booted, but fourteen findings plus graph-shape holes (G7–G12) were still live: untyped `ModuleInitDeps`, `process.env.PORT`, a 50-item list with no cursor, `!` assertions, kill-switch fail-open on read errors, and `offer.withdrawn` consumed without a publisher.

**Decision.**

1. `ModuleInitDeps` is structural (`ModuleDb`, `ModulePlatform`, `ServerEnv`). Shared does not import `@bbc/db`. Modules that need Drizzle take `const conn = db as Executor` once in `init`.
2. Listen port is `ServerEnv.PORT` (`z.coerce.number().int().positive().default(8000)`). No `process.env.PORT` at the serve call.
3. `RequestList` is `{ items, hasMore }`. GET `/v1/requests` reads 51 rows, returns 50, `hasMore` when the 51st exists. The app shows “Showing your 50 most recent”.
4. `DEFAULT_HOME_AIRPORT = "JFK"` in `@bbc/shared/defaults` is the only home-airport fallback (BFF, not a second literal).
5. `@typescript-eslint/no-non-null-assertion` is an error on `packages/modules/**/src/**` and `apps/api/src/**` (tests and seed fixtures excluded). Generated Expo Router types under `**/.expo/**` stay ignored.
6. `scripts/graph-shape.py` is the G7–G12 protocol. G9–G11 fail the build; G7/G8/G12 are printed for the PR. CI runs it after `db:verify`.
7. Kill/pause flag **read errors** fail closed (`true`). A missing row is still not killed. The 30s cache is skipped for those keys.
8. `offer.withdrawn` is live. `POST /v1/internal/offers/:id/withdraw` (`proposals:withdraw`) publishes it; pending pushes are suppressed. The catalogue is not `deprecated` / `noConsumer`.

**Consequence.** Inventory stays OR (`noConsumer || deprecated`). Account deletion still redacts `requests.requests` (CHECK-safe placeholders) and wipes every other `member_id` table named in `delete.test.ts` — no allow-list. Recurrence is `module:check` (enums, fetch `signal`, `JSON.parse` + `safeParse`, `void loadHome|gate` + `.catch`) and `graph-shape.py`, not a document.
