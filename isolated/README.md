# Isolated backend snapshots

Reference slices of the BBC Club API, kept **out of the Expo app** in `src/`.

They are not a runnable monorepo. Do not import them from the mobile app until they are assembled on purpose.

Join / verify / waitlist policy: `docs/adr/ADR-PROD-001-join-access-and-verify.md`.

| Folder | Role |
| --- | --- |
| `host-production` | Thin API host (`buildApp`, module registry, BFF stub) |
| `packages-db-production` | Drizzle / Postgres schemas per module |
| `platform-production` | Journal, poller, flags, jobs, telemetry |
| `authz-production` | Principals, permissions, authorize middleware |
| `enforcement-production` | Tooling constitution (boundaries, validate, MODULE.md) |
| `identity-production` | Better Auth / `core/identity` |
| `infra-production-v2` | VPS compose (dev/test/staging/prod), Caddy, pgBackRest, deploy/restore, `eas.json` |

Knowledge graph for these folders: `isolated/graphify-out/` (`graph.html`, `GRAPH_REPORT.md`, `graph.json`).
