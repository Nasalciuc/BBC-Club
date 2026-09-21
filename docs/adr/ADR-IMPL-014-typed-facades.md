# ADR-IMPL-014 — Typed facades as the compiler-checked module contract

Status: accepted · Date: 2026-09-21 · Supersedes nothing; amends ADR-IMPL-009 (rules as build failures) and ADR-IMPL-013 (`ModuleInitDeps` structural). `packages/shared` is ADR-gated.

**Context.** Module boundaries were verified by convention: five consumers each held a hand-written `Ports` copy; four `api/index.ts` files were `return {}` stubs nobody imported; the registry checked that a port **exists**, never that it has the **shape** the consumer wrote down. After campaigns and the operator panel there will be fifteen copies and one will be wrong.

**Decision.**

1. `ModuleDb` / `ModulePlatform` in `packages/shared/src/module-contract.ts` have zero `any`. `transaction` is generic over `unknown`. `publish` / `tombstoneMember` / `registerConsumer` / `jobs.register` use structural types shared already owns (`PublishInput`, `ConsumerSpec`, `JobSpec`). Shared still does not import `@bbc/db` or `@bbc/platform`.
2. `JobSpec.handler` and `ConsumerSpec.handler` are **methods**, not properties, so `(ctx: JobContext)` handlers assign under `strictFunctionTypes` without casts.
3. Route apps are `Hono<AppEnv>` (`principal` + `requestId`). `PrincipalVars` is an alias of `AppEnv`.
4. Every module’s `api/index.ts` exports exactly one `XFacade` type plus opaque row types. Implementation lives in `module.ts` (`const expose: XFacade`). No `createXFacade()` in `api/index.ts`.
5. Consumers compose `Ports` from `import type { XFacade } from "@bbc/x"`. `scripts/graph-shape.py` G13 fails if a `needs: ["x"]` file does not import `XFacade` from `@bbc/x` (inspects `module.ts` / BFF only — a `ports/` alias does not count).
6. Email and push own `EmailFacade` / `PushFacade`. Identity and notifications import those packages for `Ports`; `ports/email.ts` / `ports/push.ts` may re-export aliases for `createAuth` / handlers.

**Consequence.** Shape is checked at every `tsc`, before boot. A sixth hand-written port copy cannot land because G13 fails it. Recurrence is `module:check` (stub / missing `XFacade` / `createXFacade`) and G13, not a document.
