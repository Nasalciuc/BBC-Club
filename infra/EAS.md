# EAS notes

- Secrets per environment (`EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, Apple/Google credentials) are **EAS Environment Variables**
  (`eas env:create --environment preview|production`), not values in `eas.json` — EAS does not interpolate `$VARS` in this file.
- `appVersionSource: remote` + `autoIncrement` on production: build numbers live on EAS, never edited by hand.
- `runtimeVersion` policy `fingerprint` is set in `app.json` (ADR-IMPL-079): an OTA reaches only the builds with the same
  native fingerprint, so older builds never receive JavaScript they cannot run, and a native change needs a new build.
  `fingerprint.config.js` leaves the Firebase file (`GOOGLE_SERVICES_JSON`) out of the hash, so a GitHub runner and EAS
  Build compute one runtime for one commit; a change to that file alone needs a `version` bump to start a build. The
  0.2.0 APK (runtime `0.2.0`) receives no more updates: testers install the 0.3.0 preview build once.
- By itself (`api-deploy`, after `validate` on main, staging first): an EAS update on channel `preview` (Android, the
  `preview` environment) when a finished preview build has the commit's runtime, else a new preview build; nothing when
  the app is unchanged since the last preview update. Both run inside the environment (`eas env:exec preview '…'`):
  eas-cli reads `app.config.ts` with the shell's env before it loads the EAS environment, and the config's staging
  and production checks refuse it without the environment's values. Production builds, submits and channel
  `production` stay by hand.
  Dry run, and rejecting an older production approval: `docs/release.md` section 1c. `eas-cli` is pinned to one version
  in both workflows (`EAS_CLI_VERSION`), run with `bunx`.
- Channels: development · preview (TestFlight internal / Play internal) · production. JS-only fixes: `eas update --channel production`.
