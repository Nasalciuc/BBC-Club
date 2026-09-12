# Multi-stage: the whole workspace is needed at build (paths, contracts, migrations), a pruned copy at runtime.
FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages
RUN bun install --frozen-lockfile --production=false

FROM oven/bun:1.3-alpine AS build
WORKDIR /repo
COPY --from=deps /repo /repo
COPY apps/api ./apps/api
RUN bun run --filter @bbc/api typecheck

FROM oven/bun:1.3-alpine AS runtime
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
