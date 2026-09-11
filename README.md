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

## Status

Entry flow UI; backend not wired.
