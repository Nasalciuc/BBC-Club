# @bbc/api — the host

`buildApp()` does six things and nothing else: env → db + platform → modules in layer order (ports satisfied from earlier facades, killed modules skipped) → middleware in fixed order → routes (Better Auth, module routes, jobs) → poller. `shutdown()` stops the poller after the in-flight delivery and closes the pool; SIGTERM calls it.

**Adding a module:** one line in `src/modules.ts`. If its consumers have no handler at boot, or it asks for a port from a higher layer, boot fails — on purpose.

**Tests:** `docker compose -f infra/compose.test.yml up -d && bun test`. `test/helpers/test-app.ts` boots the full host in memory with a capturing email sender, a mock CRM and a recording push adapter; `testAuth` creates real members and returns real session cookies and an operator JWT. `drainAll()` drives the poller; nobody waits on timers. The smoke test is Demo 2 in code.
