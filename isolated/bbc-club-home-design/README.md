# BBC Club — Home design (reference only)

Hi-fi Next.js prototype for the in-app **Explore / Home** shell and the visual language used for the next product pages (fare detail, request sheet, requests, profile).

## Rules

- **Do not import** this package into `apps/mobile` or any `@bbc/*` package.
- Rebuild UI in React Native via `@bbc/ui` tokens/components; treat this folder as a visual + state reference.
- Monorepo package manager is Bun. Use **pnpm only inside this folder** if you want to run the prototype locally.

## Run locally

```bash
cd isolated/bbc-club-home-design
pnpm install
pnpm dev
```

## Source

Snapshot of `C:\Users\user\Documents\bbc-club-home-design` (interactive Home: rest / selected / typing / offers).
