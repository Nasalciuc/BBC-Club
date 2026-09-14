# @bbc/api — the host

`buildApp()` does six things and nothing else: env → db + platform → modules in layer order (ports satisfied from earlier facades, killed modules skipped) → middleware in fixed order → routes (Better Auth, module routes, jobs) → poller. `shutdown()` stops the poller after the in-flight delivery and closes the pool; SIGTERM calls it.

**Adding a module:** one line in `src/modules.ts`. If its consumers have no handler at boot, or it asks for a port from a higher layer, boot fails — on purpose.

**Tests:** `docker compose -f infra/compose.test.yml up -d && bun test`. `test/helpers/test-app.ts` boots the full host in memory with a capturing email sender, a mock CRM and a recording push adapter; `testAuth` creates real members and returns real session cookies and an operator JWT. `drainAll()` drives the poller; nobody waits on timers. The smoke test is Demo 2 in code.

## Verified against installed versions

Pinned: **hono 4.13.x**, **Bun 1.3.4**, **jose 6.x**.

| #             | Assumption                                                                                                                                                       | Result                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 10            | `hono/request-id`, `hono/secure-headers`, `hono/body-limit`, `hono/timing`                                                                                       | All resolve (`require` / typecheck)                                                    |
| 11            | `Bun.serve({ idleTimeout })`                                                                                                                                     | Accepted by Bun 1.3.4 (`src/index.ts`)                                                 |
| 6 (host)      | Operator JWT `iss`/`aud` = `APP_ORIGIN`; JWKS via identity handler                                                                                               | `test/library-assumptions.test.ts`                                                     |
| Mobile (docs) | `@better-auth/expo` 1.6.31 `expoClient({ scheme, storagePrefix, storage })`; `getCookie()` on client actions; `emailOTPClient` from `better-auth/client/plugins` | Confirmed against installed `.d.ts` / exports (runtime on device is Phase E / Maestro) |
