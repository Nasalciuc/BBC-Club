# ADR-IMPL-021 — Job schedules are declared in code; the crontab is generated

Status: accepted · Date: 2026-09-26 · Amends nothing. `packages/shared` is ADR-gated (`JobSpec`).

**Context.** `infra/cron/crontab` was hand-maintained. It drifted from the jobs modules actually register: missing `send-requests` and `dispatch` (members never got CRM submit or push), listing jobs that do not exist (`reconcile-activities`, `sync-mirror`), and running `receipts` daily instead of hourly.

**Decision.**

1. Every `JobSpec` declares a required `cron` field — five crontab fields, or `"manual"` for HTTP-only runs.
2. `platform.jobs.schedule()` is the only input of `bun run cron:gen`, which writes `infra/cron/crontab`.
3. A CI test fails if the committed crontab differs from what the registered specs generate.

**Consequence.** Adding a job without a schedule is a type error. Adding a schedule without regenerating the crontab is a red build. The cron container stops inventing work the API does not own.
