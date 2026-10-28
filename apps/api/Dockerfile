# Multi-stage: the whole workspace is needed at build (paths, contracts, migrations), a pruned copy at runtime.
# Bun pinned to one build (1.3-alpine as of 13 May 2026, Bun 1.3.14) in all three stages: its ICU is where the server's
# time zones come from, and a dated search's day is the zone's day by those rules (zoneDayBounds). A new Bun can move
# a zone's day: bump the digest on purpose and run the catalogue's tz-parity test against Postgres (ADR-IMPL-077).
FROM oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS deps
WORKDIR /repo
COPY package.json bun.lock turbo.json tsconfig.base.json bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages ./packages
# patchedDependencies (package.json): bun install applies them, and fails without the files.
COPY patches ./patches
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build
WORKDIR /repo
COPY --from=deps /repo /repo
COPY apps/api ./apps/api
COPY scripts ./scripts
# The scripts run from this image (the staging demo at deploy step 7; by hand, the review account and the load test's
# accounts) resolve their imports through the root tsconfig.json's paths, as in the repository. Without it Bun falls
# back to @bbc/shared's exports (`./src/*.ts`), which name no folder — and `@bbc/shared/events` is one (ADR-IMPL-040).
COPY tsconfig.json ./
RUN bun run --filter @bbc/api typecheck

FROM oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime
RUN addgroup -S bbc && adduser -S bbc -G bbc
WORKDIR /repo
COPY --from=build --chown=bbc:bbc /repo /repo
USER bbc
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD bun -e "fetch('http://localhost:8000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# db:migrate runs from this same image (deploy.sh step 3): packages/db and its migrations are inside.
CMD ["bun", "apps/api/src/index.ts"]
