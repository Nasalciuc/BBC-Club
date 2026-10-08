# Release checklist

No secrets belong in this file or in the repository.

## 1. EAS environment — production

`apps/mobile/eas.json` `build.production.env` already sets:

- `EXPO_PUBLIC_API_URL=https://api.buybusinessclass.com`
- `EXPO_PUBLIC_APP_ENV=production`

Set these on the EAS **production** environment (dashboard or `eas env:create`), **not** in git:

- `EXPO_PUBLIC_PRIVACY_URL` — https URL (required; `assertProductionEnv` refuses the build without it)
- `EXPO_PUBLIC_TERMS_URL` — https URL (required)
- `EXPO_PUBLIC_SUPPORT_PHONE` — optional E.164. Empty hides Call support.
- `EXPO_PUBLIC_MAPBOX_TOKEN` — the Mapbox **public** token, `pk.…` (required; ADR-IMPL-035). Visibility _Sensitive_.
  Never a secret `sk.` token: `assertProductionEnv` refuses it.

A production build with `EXPO_PUBLIC_APP_ENV=production` and a missing legal URL or Mapbox token fails at
`apps/mobile/app.config.ts`. Before launch the Mapbox account needs a payment card: without one its free tier is limited
to 100 monthly active users, and every reinstall counts as a new one. Set Mapbox usage alerts at the same time.

## 1b. EAS environment — preview (staging)

The `preview` profile reads the EAS **preview** environment; `eas.json` sets only `EXPO_PUBLIC_APP_ENV=staging`.

- `EXPO_PUBLIC_API_URL` — the staging API over https: the tunnel today, `https://api-staging.buybusinessclass.com`
  once the company DNS points there. `assertStagingEnv` refuses a build or an update without it. Changing it needs an
  OTA update only, never a new build.
- `EXPO_PUBLIC_MAPBOX_TOKEN` — the same `pk.` token. Without it the app draws the fallback globe.

**Native modules change the runtime.** Adding or upgrading one (Mapbox, for instance) needs a new build _and_ a new
`version` in `app.json`: `runtimeVersion` follows the app version, so OTA updates for the new version never reach an
older APK that lacks the module — `@rnmapbox/maps` throws on import there.

## 2. Review account

Against production:

```bash
cd /opt/bbc/infra && docker compose -f docker-compose.yml -f compose.prod.yml --env-file env/production.env run --rm --no-deps api bun run scripts/seed-review-account.ts
```

`REVIEW_ACCOUNT_EMAIL` / `REVIEW_ACCOUNT_PASSWORD` come from the environment. Paste them into App Store Connect and Play Console only. The script is idempotent and may be run again at any time: it keeps the account verified and active, and puts the password back to the environment's if the reviewer changed it. In production it creates the account only — the demo data of staging (ADR-IMPL-040) never runs there.

## 3. e2e on the exact commit

`e2e-android.yml` does not run on `push` to `main`. A no-squash merge commit is a new SHA with no e2e run.

Do **not** edit `e2e-android.yml`. `.github/workflows/release.yml` closes the gap:

1. If a successful `e2e-android` run already exists for `GITHUB_SHA`, it proceeds.
2. Otherwise it runs `gh workflow run e2e-android --ref main`, waits with `gh run watch`, and continues only if that run succeeded **and** its `headSha` equals `GITHUB_SHA`.
3. If main moved under the dispatch, the job fails with “main moved”. Re-run release on the new tip.

## 4. Production build

```bash
cd apps/mobile
eas build --profile production --platform android --non-interactive
```

Or dispatch **release** (`platform=android`, `submit=false`). Needs repo secret `EXPO_TOKEN`. Never run a production build or submit from a pull request.

## 5. Android submit

`submit.production.android` is `track: internal` and `releaseStatus: draft`. There is **no** `serviceAccountKeyPath`: `eas submit` uses the Google Service Account key stored in the project's EAS credentials ([Expo: Submit to Play](https://docs.expo.dev/submit/android/)). The key never lives in CI or the repo. `.gitignore` and the tracked-secrets step in `validate.yml` stay as a second line of defence.

Owner, once:

1. Create the app in Play Console.
2. Upload the first AAB with eas submit, or manually in Play Console if you prefer. If the API submission is refused because the app has no release yet, upload that first AAB manually, then use eas submit from the next one.
3. Create the service-account key and upload it under **EAS → Credentials → Service Credentials → Add a Google Service Account Key**.

```bash
eas submit --profile production --platform android --id <build-id>
```

Or dispatch **release** with `submit=true`. That workflow submits **this run's** build id (`eas submit --id`), never `--latest`.

## 6. iOS — pending

No Apple Developer account yet. Do not restore `submit.production.ios` until the team id and App Store Connect app id exist. `release.yml` accepts `platform=ios` and fails immediately.

When a Mac exists: Xcode → Privacy Report, confirm `docs/store/ios-privacy-manifest.md`. After the first TestFlight upload, any required-reason Apple emails as missing goes into `apps/mobile/privacy-supplement.json`; re-run `bun run scripts/privacy-manifest.ts`.
