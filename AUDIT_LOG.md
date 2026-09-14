# AUDIT_LOG — 2026-09-14

Branch: `fix/bug-hunt` from `origin/fix/audit-main` (PR #14 not merged; `origin/main` tip `67cfd49`).

| #   | pattern | file                                                   | finding                                                                                                     | fix commit | test                               |
| --- | ------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- |
| 1.1 | P3      | packages/modules/platform/src/jobs/index.ts            | session advisory lock via pooled db.execute; unlock on other conn                                           | commit 1   | jobs-singleton.test.ts             |
| 1.2 | P3      | packages/modules/platform/src/infrastructure/schema.ts | bigserial on event_id/delivery_id refs (already bigint on audit-main; verify check 9 + no-serial-refs.test) | commit 1   | no-serial-refs.test.ts + db:verify |
| 1.3 | P3+P5   | packages/db/migrations/0002 + migrate.ts               | 0002 never applied; view heuristic; deleted 0002; ledger extras_applied                                     | commit 1   | migrate.test.ts                    |
| 1.4 | P3      | packages/modules/platform/src/events/poller.ts         | Promise.race timeout left handler running on closed tx                                                      | commit 1   | journal.test.ts abort signal       |
| 1.5 | P2      | packages/modules/integration/crm/src/module.ts         | CRM_ADAPTER read from process.env outside loadEnv                                                           | commit 1   | crm-adapter-env.test.ts            |
| 2.1 | P2+P3   | scripts/check-modules.ts                               | no permanent probes for camelCase-in-SQL / serial refs                                                      | commit 2   | module:check                       |
| 2.2 | P5      | apps/api/test/permissions.test.ts                      | authorize() perms could silently 403 everyone                                                               | commit 2   | permissions.test.ts                |
| 2.3 | P4      | apps/api/test/ports.test.ts                            | port adapters could drift from interfaces without runtime check                                             | commit 2   | ports.test.ts                      |
| 3.5 | P1      | identity rateLimit / clients                           | assumed Retry-After; Better Auth 1.6.31 emits X-Retry-After; route keys OK (429)                            | commit 3   | library-assumptions.test.ts        |
| 3.6 | P1      | apps/api principal jwtVerify                           | iss/aud must equal APP_ORIGIN — plugin defaults match; locked by decodeJwt test                             | commit 3   | library-assumptions.test.ts        |

## Graph findings

### God nodes (top 15)

1. scripts (20) · 2. buildApp() (18) · 3. createPlatform() (16) · 4. createDb() (16) · 5. RUNBOOK (16) · 6. authorize() (15) · 7. expo (15) · 8. compilerOptions (15) · 9. EventRegistry (14) · 10. ModuleDescriptor (14) · 11. Club (14) · 12. paths (14) · 13. react-native (13) · 14. testApp() (12) · 15. registerRoute() (12)

### G1 — dead files (verdicts)

| file                                                                                                 | verdict                                                                |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| apps/mobile/src/features/auth/flows.ts                                                               | Phase E — expected unused until screens wire Better Auth client        |
| apps/mobile/src/features/auth/schemas.ts                                                             | Phase E — expected                                                     |
| docs/examples/routes.example.ts                                                                      | docs example — keep                                                    |
| packages/modules/*/src/infrastructure/schema.ts (members, notifications, engagement, proposals, crm) | re-exported via packages/db/src/schema — graph misses barrel; not dead |
| packages/modules/*/src/api/index.ts (notifications, engagement, proposals, crm, email, push)         | facades for later stages / host ports — expected sparse callers        |
| packages/modules/integration/crm/src/handlers/on-offer-responded.ts                                  | wired via module consumers — graph miss on registerConsumer            |
| packages/modules/platform/src/authz/principal.ts                                                     | host uses apps/api principal; platform copy is shared surface — note   |
| packages/shared/src/index.ts · packages/ui/src/{index,tokens}.ts                                     | package entrypoints — expected                                         |

### G2 — dead symbols (notable)

- Expected unused today: `forUpdateSkipLocked`, `tryAdvisoryXactLock` (db helpers).
- `tombstoneMember` is exported via platform events API and used from journal tests / delete cascade — not dead.
- Facade methods (`getStatus`, `timezoneOf`, `visibleTo`, …) waiting on later stages — noted, not bugs.
- Screen components flagged because Expo Router loads them by file path — false positives.

### G3 — duplicate definitions

- Expected: `Role` (access + permissions), `Logger`/`Metrics` (type aliases), `Props` (RN), `base()` (event helpers), `camel()` (scripts), `deleteAccount()` (mobile flow vs identity facade — different layers).
- `Exposes`/`Ports`/`Flags` — TypeScript local type names, not two sources of truth.
- No unexpected twin implementations of the same runtime symbol beyond PR #14 Principal/err pattern.

### G4 — boundary crossings

- mobile→backend: **0**
- modules→apps/api: **[]**
- cross-module bypassing api/ports: **{}**
- shared→runtime: **[]**
  Gate holds.

### G5 — journal fan-in

Publishers (graph): identity `auth.ts`, identity `ports/events.ts`, platform `api`/`events`/`publish`.
Actual publish call sites all use `event()` from `@bbc/shared/events` (identity, members handlers, proposals ingest, engagement respond). Grep confirmed. Consumer registrations live in `module.ts` files (graph only sees `registry.ts`).

### G6 — raw SQL sites

Highest density: `poller.ts` (20), `jobs/index.ts` (11), `builtin.ts` (10), `migrate.ts`/`verify.ts`. Commit 2 camelCase probe targets these.

### G7 — hubs

`createPlatform` / `createDb` / `EventRegistry` / `buildApp` lead (among code symbols). Commits 1–3 touch three of them.

---

## Verified against installed versions (commit 3)

- better-auth 1.6.31 · @better-auth/expo 1.6.31 · drizzle-orm 1.0.0-rc.4 · hono 4.13.7 · postgres 3.4.9 · jose 6.2.12 · pino 9.14.0 · expo-secure-store 57.0.4 · Bun 1.3.4
- Rate-limit probe: sign-in/email → 401×5 then **429** with **X-Retry-After: 600**; email-otp/send-verification-otp → 4th **429**.
