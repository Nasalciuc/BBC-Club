# PLAN.md — the living checklist (tick lines in PRs)

## Stage 0 — Foundation (days 1–10) · DoD: validate green · app on iOS+Android · /ready on staging · restore tested

- [ ] D1 fix commit 1 (PROMPT_FIX_COMMIT1 tasks 1–9) — verified on a fresh clone
- [x] D2 monorepo: turbo, workspaces, `apps/mobile`, `packages/{ui,shared,db}`; app runs unchanged
- [ ] D3 tokens generated from DESIGN.md; Uniwind configured; `design_v3` in repo; `constants/club.ts` deleted
- [ ] D4 contracts (api v1 + events v1 + errors) · 9 modules scaffolded · MODULE.md filled
- [ ] D5 enforcement: cruiser, eslint boundaries, validate, CI, CODEOWNERS, PR template · a forbidden import fails CI
- [ ] D6 platform: journal + poller + flags + jobs · migration 0001 + extras · 12 journal tests green
- [ ] D7 host: registry, middleware, error contract, /ready, /metrics, app-config · boot test green
- [ ] D8 infra: compose (prod/staging/test), Caddy, bootstrap, deploy with rollback, restore-test run once
- [ ] D9 eas.json · dev build on iPhone + Android · Maestro sign-in + register · Demo 1
- [ ] D10 close: DoD all green · Betty's decisions in ADRs · tag `stage-0-done`

## Stage 1 — Identity (real register/sign-in/reset/delete on device) · DoD: delete = zero rows · Maestro green

- [ ] identity wired in host · email deliverability (SPF/DKIM/DMARC, bounce alert) · members profile + reconcile · mobile flows bound · 6 gate tests green

## Stage 2 — Vertical slice (feed → detail → interested) · DoD: fixture parity · smoke test green · Demo 2

- [ ] proposals (ingest, feed, expire, withdraw) · engagement · BFF view-models · feed + detail screens · Archon pilot on 2 modules

## Stage 3 — Notifications · DoD: push on iPhone + Android < 60 s · dead tokens deactivated

- [ ] notifications (enqueue, dispatcher, quiet hours, consent) · push APNs + FCM · devices · inbox + preferences · campaigns

## Stage 4 — Full member · DoD: Maria's QA gate on 4 phones · crash-free 100 % one week

- [ ] onboarding · profile · waitlist · forced-update · app lock · Android depth (font 1.3×, edge-to-edge) · a11y · Sentry + GlitchTip

## Stage 5 — CRM + personalization · DoD: real client recognised · interest visible in CRM · nightly sync alerting

- [ ] crm mirror sync + connector · reconcile activities · personalization v1 (features, rules, candidates)

## Stage 6 — Hardening + beta · DoD: prod restore tested · perf budgets met · sign-off Betty/Dan/Maria

- [ ] prod infra · release train + OTA rules · Maestro on prod build · internal + external beta

## Stage 7 — Launch (January 2027)

- [ ] submit both stores · review round · staged rollout 10 → 50 → 100 % · first week = observe
