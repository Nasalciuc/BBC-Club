# BuyBusinessClass Club

Private travel club app for BuyBusinessClass clients. Entry is a cinematic cabin (sign in, join, verify, password); inside, a daylight proposals feed.

## Stack

Expo SDK 57, Expo Router, React Native, Reanimated 4, expo-image, expo-symbols. Design tokens live in `src/constants/club.ts`. System: [DESIGN.md](./DESIGN.md).

## Develop

```bash
npm ci
npx expo start
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

Entry flow UI; backend not wired.
