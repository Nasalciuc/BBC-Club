## What / why

<!-- one paragraph; link the PLAN.md line this PR ticks -->

## PLAN.md line(s) ticked

- [ ] …

## Definition of done (all must be true)

- [ ] `bun run validate` green (link to the CI run)
- [ ] tests for the module touched + the route inventory test still passes
- [ ] `MODULE.md` reflects reality (tables, events published/consumed, ports)
- [ ] no inline hex/px, no `process.env.X as string`, no unawaited `send*`/`publish*`
- [ ] if UI: `testID` on every interactive element + screenshot on iOS **and** Android
- [ ] if schema: numbered migration + `db:verify` green
- [ ] if events: versioned schema in `packages/shared/events` + idempotent handler test (event delivered twice → one effect)
- [ ] after merge/rebase onto `main`: `bun run --filter @bbc/api typecheck`
- [ ] if `registry.ts` touched: `bun test --cwd apps/api test/boot.test.ts --preload ../../packages/db/src/testing/preload.ts`
- [ ] if `registerRoute` / host `/v1` routes touched: `authz.test` + `guard.test`
- [ ] if proposals ingest/schema touched: proposals contract + `proposals.test`

## Rollback

<!-- how to undo this if it misbehaves in production (OTA republish / image rollback / flag) -->
