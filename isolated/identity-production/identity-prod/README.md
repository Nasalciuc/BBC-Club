# identity-production — what this archive contains and how it drops into the monorepo

- `packages/shared/src/{env,auth-messages}.ts`, `events/member.ts` — validated env, one voice for auth errors, event schemas
- `packages/modules/core/identity/` — Better Auth instance (`infrastructure/auth.ts`), access control, facade + Hono middleware (`api/index.ts`), ports, tests, MODULE.md
- `packages/modules/integration/email/src/postmark.ts` — awaited, error-propagating sender (+ console sender for dev)
- `packages/modules/core/members/src/handlers/on-member-registered.ts` — profile creation + CRM link + nightly reconciliation
- `apps/api/src/index.ts` — Hono host mounting `/api/auth/*`, `/health`, `/ready`, `/v1/*` behind `requireMember`
- `apps/mobile/src/features/auth/{client,flows,schemas}.ts`, `app/_layout.tsx` (session gate), `app/(auth)/sign-in.tsx` (wiring example)
- `scripts/seed-review-account.ts` — App Review demo member (verified, known password)

Install: `bun add better-auth @better-auth/expo hono drizzle-orm postgres zod` (api) · `bun add better-auth @better-auth/expo expo-secure-store expo-network` (mobile) · then `npx @better-auth/cli generate --output packages/modules/core/identity/src/infrastructure/schema.ts` and set the generated tables to `pgSchema("auth")`.
Tests need `docker compose up postgres-test`; `tests/helpers/test-auth.ts` boots Better Auth against it with a capturing EmailSender and an in-memory journal.
