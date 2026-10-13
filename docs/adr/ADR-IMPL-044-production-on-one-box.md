# ADR-IMPL-044 — Production on one box: what deploys check, what the box keeps, what stops a deploy

Status: accepted · Date: 2026-10-11 · Scope: R1 (infra, the API's boot rules, migrations 0003, 0004 and 0027)

**Context.** Production and staging share one 2-vCPU, 8 GB machine behind Cloudflare on "Full (strict)", with 80 and
443 answering Cloudflare only (RUNBOOK, § The origin is reachable only through Cloudflare). Reading the deploy path end to
end before the first real member showed what would hurt first:

- Caddy asks a public CA for certificates, which it often cannot get through Cloudflare and that firewall.
- A key missing from an env file is found five minutes into a deploy, by a replica that does not start.
- `deploy.sh` read `API_REPLICAS` from the shell only (default 4) while Compose read it from the env files.
- The memory limits added up past the RAM, and nothing chose which container the kernel kills.
- GlitchTip took 1.6 GB for errors nobody sends yet.
- `/ready` mixed the system's state into each replica's answer: one dead letter held back every deploy, the fix's
  included.
- 0003 and 0004 ran on every deploy, each with an ACCESS EXCLUSIVE lock.
- A deleted member's id stayed in two places: an offer made to them alone, and a finished campaign's cursor.
- A Postmark call had no timeout.
- Push could not go live without the Apple account, which does not exist yet.
- Every deploy hands Compose both env files, `staging.env` last, so a key both set reached production with staging's
  value: production's cron sent staging's `INTERNAL_API_SECRET`, and MinIO took staging's empty password.
- Step 4 started the pooler with its dependencies, so a changed Postgres setting restarted Postgres mid-deploy.
- Two dispatches of the deploy workflow could run on the box at once and swap its one checkout under each other, and
  the SSH step ended any deploy after 10 minutes, the length of production's canary.
- Nothing measured what the box carries: the nightly bench has answered 429 since the read limits (#42), and k6 had no
  way to sign in on staging.
- The review account script could not put a changed password back anywhere but in tests.

**Decision.**

- **The origin certificate.** `ORIGIN_TLS=on` makes Caddy serve a Cloudflare Origin CA certificate from
  `ORIGIN_CERT_DIR` and ask no CA; `off`, or unset, keeps Caddy's own certificates. Each site has one `tls` block, and
  `origin-pulls.caddy` is read inside it, because two `tls` blocks for the same names make Caddy refuse the config.
  `origin_tls_check` (`infra/env-value.sh`) runs before bootstrap or a deploy changes anything: both files present, the
  key readable by its owner only and matching the certificate, not expired (under 30 days left is a warning, so a
  rollback still runs), both domains named. CI
  validates the Caddyfile four ways: `ORIGIN_TLS` off and on, each with Authenticated Origin Pulls empty and filled in.
- **Caddy holds no secret.** Its container gets the four settings the Caddyfile reads, not all of `production.env`, and
  mounts `infra/caddy` as a directory, so `caddy reload` sees the file git replaced. Deploy step 8 runs a one-off
  `caddy validate`, then `up -d` (a new container only when a setting changed), then a graceful reload. One Caddy
  serves both environments and reads `infra/caddy` from the box's one checkout, so staging takes only `origin/main`'s:
  the workflow refuses a staging dispatch whose `infra/caddy` differs, before its checkout, and step 8 of a staging
  deploy applies only that directory as `origin/main` has it.
- **`staging.env` holds staging's own names.** `guard_staging` refuses there any key the production compose files
  substitute (`${KEY}`), by name, before anything changes. Staging's secret has its own name,
  `INTERNAL_API_SECRET_STAGING`, which `compose.staging.yml` hands its API, worker and cron as `INTERNAL_API_SECRET`.
- **The env is checked by the code that will read it.** `scripts/check-env.ts` runs the server's boot rules (`loadEnv`)
  inside the new image, as the API and as the worker: bootstrap before anything starts, deploy at step 2 while the old
  API serves. A refusal names the setting, never a value. Rules that lived only in module code moved into `loadEnv`
  (the CRM `http` adapter, push keys), so the check sees them. Compose reads `KEY=   # hint` as the value "# hint", so
  a secret holding the example's comment (`OPS_LINK_SECRET`, `BETTER_AUTH_SECRET`, …) is refused: anyone can read it in
  this repo. Any other setting left that way is named on a ⚠ line; the examples keep every comment on its own line.
- **Two replicas, read the way Compose reads them.** `API_REPLICAS` defaults to 2 in Compose and in `deploy.sh`, which
  reads it as Compose does: the shell, then `staging.env`, then `production.env`. The canary counts the service's
  containers as Compose does for `--scale` — stopped ones too, never the one-off containers of `compose run` — instead
  of assuming N: changing N never leaves a deploy without a canary, a stopped old container is never started and
  judged as one, and a job an operator runs beside a deploy is neither counted nor stopped.
- **A deploy never restarts Postgres.** Step 4 starts the pooler with `--no-deps`. Postgres takes a new setting
  (`stop_grace_period: 60s`, `oom_score_adj`, `POSTGRES_MEMORY`) when it is recreated on purpose, in a quiet minute.
- **One deploy at a time on the box, and time to finish.** The workflow holds `/var/lock/bbc-deploy.lock` from its
  `git checkout` to the end of `deploy.sh`, and gives the SSH step an hour: the action's default of 10 minutes would
  end a production deploy during its 10-minute canary, with no rollback.
- **Memory.** The limits add up to 6.9 of 8 GB (sum at the top of `docker-compose.yml`), and three of them come from env.
  Staging goes first under pressure (`oom_score_adj` 500), Postgres last (-500).
- **GlitchTip waits.** Its four containers are a Compose profile, on with `GLITCHTIP=on`; I2 decides what errors go where.
- **Push on Android alone.** `PUSH_ADAPTER=live` needs FCM; the APNs keys come all together or not at all. Without
  them an iPhone notification gets `Fatal` without a request: marked failed, never retried, its token kept for when the
  keys arrive. The app reads Firebase's `google-services.json` from an EAS file variable (`GOOGLE_SERVICES_JSON`), never
  from git.
- **`/ready` is this process; `/status` is the system.** `/ready` answers draining or not, and whether its database
  answers. Deploys and bootstrap wait on it. `/status` holds the queue (nothing pending over 5 minutes, no dead
  letter) and every scheduled job on time, answers 503 when unwell, and is what Uptime Kuma watches.
- **Every numbered migration runs once.** 0003 and 0004 are recorded in `platform.extras_applied` like every other
  file. A database that ran them before runs them one last time and records them.
- **An idle transaction ends after 60 s** (0027, a role setting like 0019, so it reaches sessions through PgBouncer).
  The longest legitimate wait inside a transaction is an event handler's 30 s ceiling.
- **A deleted member leaves no id.** The proposals consumer deletes offers that name the member in
  `target_member_id`; the CHECK `offers_targeting_consistent` forbids clearing it. A finished campaign clears its
  cursor, and the notifications consumer clears the cursor of an older finished one. G11 (`scripts/graph-shape.py`,
  `db:verify` § 12) now covers every `*_member_id` column, not only `member_id`.
- **Postmark calls end after 4 s**, under the CRM's 5 s ceiling, so a request to the specialists fails with Postmark's
  own reason.
- **Old images go.** Step 8 removes old API images and keeps the one it deployed, the one it replaced, the other
  environment's and the five newest.
- **Load is measured on staging, from outside.** Grafana Cloud k6 sends `loadtest/k6/mixed.js` from Frankfurt through
  Cloudflare; the `step` profile climbs 100 requests a second every 2 minutes and stops at the first failed threshold
  (docs/perf/LOADTEST.md). `scripts/loadtest-staging.ts` makes the accounts as a sign-up does and removes them as a
  deletion does, through the whole app, so the worker writes and clears their rows like anyone's. The nightly bench
  lifts the read limits for its own run and puts them back.
- **Scripts hash with Better Auth's own hasher, directly** (`hashPassword` from `better-auth/crypto`, the function
  Better Auth itself calls, so the format moves with its version). The breach-check plugin wraps `ctx.password.hash`
  and needs a request around it; outside test mode the review account script threw there, and never put a changed
  password back.

**Consequences.**

- The first deploy carrying this recreates Caddy once (new mounts and environment): a few seconds without traffic, at
  the first production deploy or the first staging deploy of a commit on `main`. Until then the old Caddyfile sends
  `/status` to the API like any path: queue counts and late job names answer from outside.
- A `staging.env` from the old example stops the first deploy until its `INTERNAL_API_SECRET`, `MINIO_USER` and
  `MINIO_PASSWORD` lines go (RUNBOOK § Deploy, The first deploy of R1). MinIO, which nothing uses yet, keeps the
  credentials it started with until it is recreated once.
- A branch that changes `infra/caddy` reaches staging only after its merge.
- Postgres keeps its old container settings until that deliberate restart; staging's `pgbouncer-staging` is recreated
  once, at step 4 of the first staging deploy.
- Rolling back past R1 is by image tag from the current checkout, with `PUSH_ADAPTER=recording` and no dead letters:
  the older image refuses live push on Android alone, and its `/ready` is red while a dead letter exists.
- The first `GLITCHTIP=off` deploy does not stop GlitchTip containers an earlier bootstrap started. RUNBOOK,
  § GlitchTip, has the two commands.
- A rollback to an image built before `scripts/check-env.ts` skips the env check, with a warning, rather than failing.
- Android push needs a new build carrying the Firebase file; an OTA update cannot add it.
- A running campaign keeps a deleted member's id as its cursor until it finishes, minutes at most.
- `psql` sessions left at `BEGIN` for more than a minute end. RUNBOOK, § Database health, has the `SET` that lifts it
  for one session.
