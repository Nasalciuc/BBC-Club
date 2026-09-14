# EAS notes

- Secrets per environment (`EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, Apple/Google credentials) are **EAS Environment Variables**
  (`eas env:create --environment preview|production`), not values in `eas.json` — EAS does not interpolate `$VARS` in this file.
- `appVersionSource: remote` + `autoIncrement` on production: build numbers live on EAS, never edited by hand.
- `runtimeVersion` policy `fingerprint` is set in `app.json`; an OTA can only reach builds with the same native fingerprint.
- Channels: development · preview (TestFlight internal / Play internal) · production. JS-only fixes: `eas update --channel production`.
