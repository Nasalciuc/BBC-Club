# AGENTS.md — read before touching anything

**Truth lives in exactly one place each.** Contracts: `packages/shared/src/{api,events}` (Zod). Design tokens: generated `packages/ui/src/tokens.ts` from `DESIGN.md` (never edit the output). Tables: `packages/modules/<layer>/<module>/src/infrastructure/schema.ts` (one Postgres schema per module). Naming, files, flows: `docs/ARCHITECTURE_MASTER.md`. Screens and copy: `REBUILD_PLAYBOOK.md`.

## Ten rules

1. **Modules talk two ways only:** direct calls through another module's `api/index.ts` for questions; events through `platform.events.publish(tx, …)` for facts. No cross-module `infrastructure/`, `schema.ts` or JOINs across Postgres schemas. `bun run arch:check` enforces it.
2. **The actor comes from the principal, never from the client.** No `memberId`/`userId` in any request schema. Ownership is in the SQL `WHERE`; someone else's resource is a 404.
3. **At-least-once + idempotent** is the default regime: handlers may run twice; use unique keys and upserts. Check state at the moment of the action (dispatch, respond), not when it was queued.
4. **Await every side effect.** No `void send…`, no `forEach(async …)`, no fire-and-forget. Errors propagate; `@typescript-eslint/no-floating-promises` is an error.
5. **Invariants live in Postgres:** `pgEnum` for states, CHECK for ranges/XOR, UNIQUE for idempotency, `timestamptz` only, `created_at` everywhere, expiry on every transient row. `db:verify` checks the live database.
6. **Env only through `loadEnv()`.** `process.env.X as string` is forbidden. Secrets never in code, logs or event payloads.
7. **Mobile:** React Compiler is ON — no `useMemo`/`useCallback`/`memo`. Reanimated only (no RN `Animated`). Colors/sizes only from `tokens`. Every interactive element has `testID="screen.element"`. Never run the app yourself; give the commands.
8. **New things have a shape.** New module → `bun run new-module`. New event → schema in `packages/shared/events` + catalogue entry + at least one consumer (or `noConsumer`). New route → `registerRoute(...)` + `authorize(permission)`. New table → migration `NNNN_<module>_<desc>.sql`.
9. **Do not touch without an ADR:** `packages/shared`, `packages/modules/platform`, existing migrations, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `DESIGN.md`. Open the PR; the integrator decides.
10. **Done means `bun run validate` is green** on a fresh checkout, `MODULE.md` matches the code, and the PR template is filled. A todo left in a contract test keeps the build red on purpose.

## When something is unclear

Read `MODULE.md` of the module, then `docs/ARCHITECTURE_MASTER.md` §B.4–B.6, then `docs/FLOWS_DEEP_DIVE.md`. If it is still unclear, write the question in the PR instead of guessing.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

React Compiler is ON. Do not add `useMemo` or `useCallback`.

Every interactive element must have a `testID`.

Colors, sizes, and radii come only from `src/constants/club.ts`. Never inline hex, rgba, font sizes, spacing, or radii.

Never run the app. Provide the commands instead.
