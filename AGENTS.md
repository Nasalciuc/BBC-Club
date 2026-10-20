# AGENTS.md — read before touching anything

**Truth lives in exactly one place each.** Contracts: `packages/shared/src/{api,events}` (Zod). Design tokens: generated `packages/ui/src/tokens.ts` from `DESIGN.md` (never edit the output). Tables: one file per Postgres schema in `packages/db/src/schema/` (`auth.ts` is identity's), each owned by one module; platform's is `packages/modules/platform/src/infrastructure/schema.ts`, and `packages/db/src/schema/index.ts` lists them all. Naming, files, flows: each module's `MODULE.md` and the ADRs in `docs/adr/`. Screens and copy: from onboarding on, `DESIGN.md` 3.0 and the 46 images in `isolated/bbc-club-3.0-design/final/` (ADR-IMPL-055) — where an image and `DESIGN.md` differ, `DESIGN.md` wins; the Figma file `nYP9gogb6hnpKxfpKiCc4g` keeps 1.0 for history. The entry (Welcome, Sign in, Join, Verify, Set password, Reset) stays exactly as it is (ADR-IMPL-046, ADR-IMPL-047): its values live in `apps/mobile/src/constants/club.ts`, pinned by `club.test.ts`.

## Ten rules

1. **Modules talk two ways only:** direct calls through another module's `api/index.ts` for questions; events through `platform.events.publish(tx, …)` for facts. No cross-module `infrastructure/`, `schema.ts` or JOINs across Postgres schemas. `bun run arch:check` enforces it.
2. **The actor comes from the principal, never from the client.** No `memberId`/`userId` in any request schema. Ownership is in the SQL `WHERE`; someone else's resource is a 404.
3. **At-least-once + idempotent** is the default regime: handlers may run twice; use unique keys and upserts. Check state at the moment of the action (dispatch, respond), not when it was queued.
4. **Await every side effect.** No `void send…`, no `forEach(async …)`, no fire-and-forget. Errors propagate. Lint does not check this yet (`@typescript-eslint/no-floating-promises` is off for the API, the app and the packages): the review does.
5. **Invariants live in Postgres:** `pgEnum` for states, CHECK for ranges/XOR, UNIQUE for idempotency, `timestamptz` only, `created_at` everywhere, expiry on every transient row. `db:verify` checks the live database.
6. **Env only through `loadEnv()`.** `process.env.X as string` is forbidden. Secrets never in code, logs or event payloads.
7. **Mobile:** React Compiler is ON — no `useMemo`/`useCallback`/`memo`. Reanimated only (no RN `Animated`). Colors/sizes only from `tokens`. Every interactive element has `testID="screen.element"`. Never run the app yourself; give the commands.
8. **New things have a shape.** New module → `bun run new-module`. New event → schema in `packages/shared/src/events` + catalogue entry + at least one consumer (or `noConsumer`). New route → `registerRoute(...)` + `authorize(permission)`. New table → migration `NNNN_<module>_<desc>.sql`.
9. **Do not touch without an ADR:** `packages/shared`, `packages/modules/platform`, existing migrations, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `DESIGN.md`. Open the PR; the integrator decides.
10. **Done means `bun run validate` is green** on a fresh checkout, `MODULE.md` matches the code, and the PR template is filled. A todo left in a contract test keeps the build red on purpose. Pre-push runs `validate:prepush` (quick + `turbo test:db`) so DB/inventory failures surface locally; CI still runs full `validate`.

## Stacked PRs / merge hotspots

After merging or rebasing onto `main`, run `bun run --filter @bbc/api typecheck`. If you touched a hotspot, also run the matching tests (preload `packages/db/src/testing/preload.ts`):

- `apps/api/src/registry.ts` → `test/boot.test.ts`
- `registerRoute` / host `/v1` routes → `test/authz.test.ts` + `test/guard.test.ts`
- proposals schema / ingest / CHECK → `@bbc/proposals` contract + `test/proposals.test.ts`
- identity password Path A → `test/password.test.ts`

Hotspot files: `apps/api/src/registry.ts`, `packages/shared/src/authz/authorize.ts` (`routeRegistry`), `apps/api/test/helpers/test-app.ts`, proposals `offers_*` CHECKs, identity `POST /v1/account/password`.

**Killswitch:** a killed module still exposes its facade so dependents boot; its routes/consumers/jobs are not registered (HTTP 404). Canonical assertion: `test/boot.test.ts`. Do not reintroduce cascade-skip of dependents.

## When something is unclear

Read `MODULE.md` of the module, then the ADRs that name it (`docs/adr/`). If it is still unclear, write the question in the PR instead of guessing.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

React Compiler is ON. Do not add `useMemo` or `useCallback`.

Every interactive element must have a `testID`.

Colors, sizes, radii, shadows and type come from the generated tokens (`tokens` from `@bbc/ui`). `src/constants/club.ts` holds the entry's own colours, spacing, radii, type and motion, written by hand so a token change does not reach them (ADR-IMPL-047, ADR-IMPL-055); `ClubButton`, `ClubIcon` and `AnimatedEntrance` read only it. The entry screens read it; outside them only the root's dark chrome and the phone column's width (`Club.layout.phoneMaxWidth`). Never inline hex, rgba, font sizes, spacing, or radii.

Never run the app. Provide the commands instead.
