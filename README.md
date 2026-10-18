# BuyBusinessClass Club

Private travel club app for BuyBusinessClass clients. Entry is a cinematic cabin (sign in, join, verify, password); inside, Explore — a globe and a search for destinations, fares and offers — a member's requests, and their profile. A specialist books by phone; the app takes no booking and no payment.

## Stack

One Bun monorepo. `apps/mobile`: Expo SDK 57, Expo Router, React Native, Reanimated 4, expo-image. `apps/api` and `packages/modules`: Bun, Hono, Drizzle, Postgres, Better Auth. Design tokens are generated into `packages/ui/src/tokens.ts` from [DESIGN.md](./DESIGN.md); screens follow the Figma file, which wins where DESIGN.md differs (ADR-IMPL-046). Rules for agents: [AGENTS.md](./AGENTS.md).

## Develop

```bash
bun install --frozen-lockfile
bun run validate:quick
cd apps/mobile && bun run start
```

Use a development build (Expo Go is not the target). iOS and Android phones only.

## Code graph

The dependency graph (`graphify-out/`) is **not** committed — it is rebuilt from the code and would
otherwise produce a 25 000-line diff on every run:

```bash
graphify update . --force
graphify god-nodes --top 15 --graph graphify-out/graph.json
```

## Agent context

After cloning, install the Expo skills (pinned by `skills-lock.json`, not committed):

```bash
npx skills@latest add expo/skills --skill '*' --agent cursor
```

Project rules for agents live in `.cursor/rules/` (committed) and in `AGENTS.md`.

## Web

Web is a development preview only; the product ships to the App Store and Google Play. Do not add web-only code paths.

## Status

The app and the API run on staging (`infra/RUNBOOK.md`); production is set up on the box but not yet deployed. The ADRs in `docs/adr/` hold the decisions.
