# Release checklist

No secrets belong in this file or in the repository.

## 1. EAS environment — production

`apps/mobile/eas.json` `build.production.env` already sets:

- `EXPO_PUBLIC_API_URL=https://api.buybusinessclass.com`
- `EXPO_PUBLIC_APP_ENV=production`

Set these on the EAS **production** environment (dashboard or `eas env:create`), **not** in git:

- `EXPO_PUBLIC_PRIVACY_URL` — https URL (required; `assertProductionEnv` refuses the build without it)
- `EXPO_PUBLIC_TERMS_URL` — https URL (required)
- `EXPO_PUBLIC_SUPPORT_PHONE` — the company's **general line**, in E.164 (`+` and the digits, no spaces). Every call
  button of the app dials it and nothing else (`apps/mobile/src/lib/support-phone.ts`; `support-phone.test.ts` holds the
  seven buttons to it): Profile's `Call us`, a request's `Call your agent` and `Call us`, the rate-limit page's
  `Call your agent`, and the update and maintenance pages' `Call an agent`. The company's phone system routes
  the call to a free agent; the app has no telephony of its own. A set number must be one the app can dial: a
  production or staging build or update refuses one with an extension, a national `(0)`, a missing `+` or the wrong
  number of digits (`assertProductionEnv`, `assertStagingEnv`). Set it for production: the build still passes
  without it, but then no call button is drawn anywhere, and one message only still asks the member to call: Join's
  `We couldn't send a code to that address. Check it, or call us.` (`apps/mobile/src/features/auth/otp-send-logic.ts`,
  when the mail service refuses the address). It belongs to the entry, which stays exactly as it is (ADR-IMPL-047),
  and says it in every build (ADR-IMPL-065, Left to the owner).
- `EXPO_PUBLIC_MAPBOX_TOKEN` — the Mapbox **public** token, `pk.…` (required; ADR-IMPL-035). Visibility _Sensitive_.
  Never a secret `sk.` token: `assertProductionEnv` refuses it.
- `GOOGLE_SERVICES_JSON` — optional, a **file** variable: Firebase's `google-services.json` for the Android app
  `com.buybusinessclass.club` (Firebase → Project settings → Your apps). Without it an Android phone gets no push
  token, so the server's live push reaches nobody. It is native: it takes effect with a new build, never with an OTA
  update. The server's `FCM_SERVICE_ACCOUNT_BASE64` comes from the same Firebase project (RUNBOOK, Push).

A production build with `EXPO_PUBLIC_APP_ENV=production` and a missing legal URL or Mapbox token fails at
`apps/mobile/app.config.ts`. Before launch the Mapbox account needs a payment card: without one its free tier is limited
to 100 monthly active users, and every reinstall counts as a new one. Set Mapbox usage alerts at the same time — the
Static Images API among them: the same token draws a city's satellite view where no photograph exists (ADR-IMPL-043),
billed per request beyond its free tier.

## 1b. EAS environment — preview (staging)

The `preview` profile reads the EAS **preview** environment; `eas.json` sets only `EXPO_PUBLIC_APP_ENV=staging`.

- `EXPO_PUBLIC_API_URL` — the staging API over https: the tunnel today, `https://api-staging.buybusinessclass.com`
  once the company DNS points there. `assertStagingEnv` refuses a build or an update without it. Changing it needs an
  OTA update only, never a new build.
- `EXPO_PUBLIC_MAPBOX_TOKEN` — the same `pk.` token. Without it the app draws the fallback globe.
- `EXPO_PUBLIC_SUPPORT_PHONE` — the same **general line**, E.164, as production. Without it no call button is drawn (a
  quoted request has no `Call your agent`, a request that could not be passed on no `Call us`, Profile no
  `Call us`; ADR-IMPL-041, A2c), and the messages that would ask the member to call say what else to do instead —
  all but Join's, which is the entry's (section 1).
  Changing it needs an OTA update only, never a new build.
- `GOOGLE_SERVICES_JSON` — the same Firebase file, for push on a staging APK (a new build).

**Checking the call buttons** (a development build, as in the README; `--clear` because an `EXPO_PUBLIC_*` value is
written into the bundle; a value set in the shell wins over `apps/mobile/.env`, and an empty one means none):

```bash
# With a made-up number (the fictional 555 range): every call button is drawn and opens the dialer on it.
cd apps/mobile && EXPO_PUBLIC_SUPPORT_PHONE=+12125550148 bun run start --clear
# Without one: no call button anywhere, and no words that ask the member to call but Join's (otp-send-logic.ts, the
# entry's, section 1).
cd apps/mobile && EXPO_PUBLIC_SUPPORT_PHONE= bun run start --clear
```

Look at Profile (`Call us` beside `Edit profile`), a request's detail (`Call your agent` on a request the club
holds; `Call us` on one not passed on, whose notice then has a phone glyph — an info glyph and no `call` without the
number), the Requests banner over a request not passed on, the rate-limit page (`Call your agent`, else `Done`),
and the update and maintenance pages (`Call an agent`). Without the number, a request the server holds but could not
pass on says the club will try again; the member is not asked to send it again (infra/RUNBOOK.md).

**Native modules change the runtime.** `runtimeVersion` is the project's native fingerprint (`policy: "fingerprint"`,
ADR-IMPL-079): adding or upgrading one (Mapbox, for instance) gives a new runtime, so OTA updates never reach an older
APK that lacks the module — `@rnmapbox/maps` throws on import there — and the change needs a new build. Bump `version`
in `app.json` with it, so testers can tell the builds apart. The Firebase file (`GOOGLE_SERVICES_JSON`) is left out of
the fingerprint (`apps/mobile/fingerprint.config.js`): a change to it alone needs a `version` bump to start a build.

## 1c. What main does by itself (ADR-IMPL-079)

A green `validate` on a push to `main` starts **api-deploy** for that commit: the API image, staging, then the preview
app, then production once approved. A commit main has already moved past stops at `gate` (its summary says
`Superseded`); the newer commit's run deploys.

- **Preview app** (Android, channel `preview`), after staging: when nothing under `apps/mobile`, `packages/ui`,
  `packages/shared`, `package.json` or `bun.lock` changed since the last preview update, nothing happens. Otherwise,
  with a finished preview build of this commit's runtime, an EAS update is published (open the app, close it, open it
  again); with one still queued or running, nothing is published and the next merge publishes onto it; with none, a
  preview build starts and testers install that APK once. The run's summary says which, with the build's link. iOS
  waits for an Apple Developer account.
- **Production**: waits for approval in the run (Review deployments) or in GitHub → Environments → `production`.
  When several wait, approve **only the newest** and reject the older ones. One approved anyway stops on the box
  before its checkout (`main is at …, past this commit`): production deploys main's tip only, so an older approval
  never puts back the older API, nor the `infra/caddy` and `infra/monitoring` production reads from that checkout. A
  run by hand for production is held to the same rule.
- **Not automatic**: the production app (sections 4–5, `release`), any iOS build, an OTA to channel `production`.

**Dry run** (no update published, no build started): Actions → api-deploy → Run workflow on `main`, `target`
`staging`, `ota` and `dry_run` on. Staging is deployed as usual; the preview step's summary gives the commit's runtime
and says whether it would publish or build. After the first merge, `eas build:view <id>` of the new preview build must
show that same runtime; if it differs, CI would build on every merge — stop the preview step and say so.

A run by hand without the dry run deploys one `target`; `ota` adds the preview step after staging.

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
eas env:exec production 'eas build --profile production --platform android --non-interactive' --non-interactive
```

Inside the production environment: eas-cli reads `app.config.ts` with the shell's env before it loads the EAS
environment, and `assertProductionEnv` refuses a production config without the section 1 values. Or dispatch **release** (`platform=android`, `submit=false`). Needs repo secret `EXPO_TOKEN`. Never run a production build or submit from a pull request.

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

Push on the server can be live before then: Android through Firebase, and an iPhone notification marked failed until the APNs keys are in `production.env` (RUNBOOK, Push).

When a Mac exists: Xcode → Privacy Report, confirm `docs/store/ios-privacy-manifest.md`. After the first TestFlight upload, any required-reason Apple emails as missing goes into `apps/mobile/privacy-supplement.json`; re-run `bun run scripts/privacy-manifest.ts`.
