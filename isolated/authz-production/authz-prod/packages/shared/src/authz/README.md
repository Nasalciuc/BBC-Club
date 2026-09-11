# authz — how authorization is enforced in BBC Club (ADR-IMPL-006)
- **Principals:** member (session cookie) · operator (Better Auth JWT, role=operator) · system (X-Internal-Secret on /v1/internal/* or JWT role=system; handlers/cron).
- **Permissions** are `resource:action`, declared once here, mapped to roles; Better Auth's access control is derived from the same map (`toAccessControlRoles()`).
- **Two layers:** `authorize(permission)` on every route (deny by default; `routeRegistry` + inventory test) and ownership **in the SQL WHERE** of scoped repositories (member id from the principal only). Missing/foreign resource → 404, wrong role → 403, wrong secret → 401.
- **Async:** handlers run as `system` with `actorMemberId` from the event; repositories are scoped identically to the request path.
- **Killswitch** per module = module-level authorization (503 + BFF fallback).
- **Lint:** `no-member-id-in-request-schemas` — any Zod request schema in packages/shared containing `memberId` fails CI.
- **Tests:** inventory · IDOR · body memberId ignored · foreign mark-read · escalation (member→internal, operator→internal, bad secret) · secret outside /internal · killswitch · handler with wrong actor.
