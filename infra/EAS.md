# EAS notes

- Secrets per environment (`EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, Apple/Google credentials) are **EAS Environment Variables**
  (`eas env:create --environment preview|production`), not values in `eas.json` — EAS does not interpolate `$VARS` in this file.
- `appVersionSource: remote` + `autoIncrement` on production: build numbers live on EAS, never edited by hand.
- `runtimeVersion` policy `appVersion` is set in `app.json`: an OTA reaches only the builds with the same `version` (today
  `0.2.0`). A native change ships with a new `version`, so older builds never receive JavaScript they cannot run.
- Channels: development · preview (TestFlight internal / Play internal) · production. JS-only fixes: `eas update --channel production`.
