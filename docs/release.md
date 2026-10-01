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

A production build with `EXPO_PUBLIC_APP_ENV=production` and a missing legal URL fails at `apps/mobile/app.config.ts`.

## 2. Review account

Against production:

```bash
bun run scripts/seed-review-account.ts
```

`REVIEW_ACCOUNT_EMAIL` / `REVIEW_ACCOUNT_PASSWORD` come from the environment. Paste them into App Store Connect and Play Console only.

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

`submit.production.android` tracks `internal` as `draft`. The Play service-account JSON lives on the machine or in EAS — it is gitignored and CI refuses it if tracked.

```bash
eas submit --profile production --platform android --id <build-id>
```

Or dispatch **release** with `submit=true`. That workflow submits **this run's** build id (`eas submit --id`), never `--latest`.

## 6. iOS — pending

No Apple Developer account yet. Do not restore `submit.production.ios` until the team id and App Store Connect app id exist. `release.yml` accepts `platform=ios` and fails immediately.

When a Mac exists: Xcode → Privacy Report, confirm `docs/store/ios-privacy-manifest.md`. After the first TestFlight upload, any required-reason Apple emails as missing goes into `apps/mobile/privacy-supplement.json`; re-run `bun run scripts/privacy-manifest.ts`.
