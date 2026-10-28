# ADR-IMPL-079 — Main deploys itself

Status: proposed · Date: 2026-10-28 · Scope: `.github/workflows/api-deploy.yml` (the chain), `release.yml` (the pinned
eas-cli), `apps/mobile/app.json` (`runtimeVersion`, `version`) and `apps/mobile/fingerprint.config.js` · Replaces the
rule in api-deploy.yml's old header ("The push trigger below stays commented out: enabling it is a separate,
owner-approved decision"): this ADR is that decision, for the owner to approve with the change. No earlier ADR held
the rule. Also replaces "`runtimeVersion` follows `appVersion`" in ADR-IMPL-070 (D4); its 0.3.0 native release stands.

**Context.** Deploying was manual: `api-deploy` ran only by hand, and no workflow published an EAS update. A merge to
`main` reached neither staging nor the testers' phones until someone dispatched it, and the preview APK kept the
JavaScript it was built with — the old design stayed on the phone after main had the new one. The runtime followed
`version` (`appVersion` policy) while main took native modules without a version change (`expo-image-picker`,
`expo-image-manipulator`, `expo-file-system`, the `expo-font` plugin, Reanimated's static flags since 0.2.0), so an
update could reach a binary without the modules it called.

**Decision.**

1. **The chain.** A successful `validate` of a push to `main` starts `api-deploy` (`workflow_run`): a `gate` job names
   the commit validate checked (`head_sha`; `github.sha` is main's tip by then) and stops a commit main has moved past;
   every later job uses that commit. Then the API image is built, staging is deployed, the preview app is brought up
   to date, and production is deployed once approved in GitHub → Environments → `production`. A run by hand takes one
   target and, for the preview step, `ota` and `dry_run`.
2. **Concurrency per deploy job** (`deploy-staging`, `deploy-production`, `ota-preview`, never cancelling one in
   progress), not per workflow: a production deploy waiting for approval keeps its run open and must not hold the next
   merges' staging deploys.
3. **The preview app.** After staging, so an update never calls an endpoint staging lacks: nothing is done when the
   app and what it bundles are unchanged since the last preview update's commit; otherwise the commit's Android
   runtime is looked up among the preview builds. A finished build gets an EAS update on channel `preview` with the
   `preview` environment; a queued or running one is left to finish, and the next merge (or a run by hand with `ota`)
   publishes onto it, since the comparison runs from the last update, not the parent; with none, a new
   preview build is started and no update is published, since the build carries the JavaScript. Both commands run
   inside the EAS `preview` environment (`eas env:exec preview`): eas-cli reads `app.config.ts` with the runner's own
   env before it loads an environment, and `assertStagingEnv` refuses a staging config without the preview API's
   address. iOS waits for an Apple Developer account.
4. **The runtime is the native fingerprint** (`runtimeVersion: { policy: "fingerprint" }`), and the version is 0.3.0.
   `fingerprint.config.js` leaves out of the hash the one input that depends on the machine — the Firebase file EAS
   Build hands the build through `GOOGLE_SERVICES_JSON` — so a runner and EAS compute the same runtime for one commit.
5. **One eas-cli**, pinned (26.0.0) and run with `bunx` in both workflows; not a workspace dependency, which would
   re-resolve the app's Expo tooling.

**Consequences.**

- The 0.2.0 APK receives no more updates: its runtime is `0.2.0`, the new one a fingerprint. The first merge after
  this change starts a 0.3.0 preview build; testers install it once, then every merge reaches the phone by itself
  (open the app, close it, open it again).
- A change to Firebase's file is not in the fingerprint: it reaches phones with a version bump, which starts a build.
- Production deploys still waiting when a newer one arrives are rejected in Environments; only the newest is approved.
  One approved anyway stops on the box before its checkout when `origin/main` is past its commit, so production never
  goes back to an older API or to the older `infra/caddy` and `infra/monitoring` it reads from that checkout; a run
  by hand for production deploys main's tip only, too. A rollback stays the RUNBOOK's, by hand.
- Each native change costs an EAS build from the Expo account's quota.
- What the chain did is in each run's summary; `dry_run` says it without publishing or building.
