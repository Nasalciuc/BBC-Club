# ADR-IMPL-040 — Staging demo data: Figma's situations, dated from today

Status: accepted · Date: 2026-10-08 · Scope: P3 (staging only; production unchanged)

**Context.** Staging is where the app is shown — to the company, to testers, for the approval pack of ADR-IMPL-037 — and
it is empty. `db:seed` (the fixture) refuses any process with `NODE_ENV=production`, and staging runs with exactly that,
as production does (`infra/env/staging.env.example`). The fixture's dates are fixed, too: its Paris offer ends on 31 Oct
2026, its Tokyo offer on 30 Nov, its flights leave in October and November; by December a demo would show expired offers
and departures in the past, and "Your October in London" in winter. Its "received / quoted / booked" requests and the
inbox items that go with them are not seeded at all. The review account script was broken (an import that no longer
exists) and typechecked nowhere.

**Decision.**

- **One account, one script, one source of data.** The review account (`REVIEW_ACCOUNT_EMAIL`, `scripts/seed-review-account.ts`)
  is the demo account: `scripts/seed-staging-demo.ts` creates or finds it, keeps it verified and **active** (our own
  account, never a CRM client), gives it Figma's member — Alex Morgan, +1 212 555-0148, home JFK — and writes the
  fixture's situations around it. Nothing invented: every route, price, carrier, title and passenger count is the
  fixture's (`packages/shared/src/fixture.ts`); only the dates move.
- **Dates from today.** Flights leave in 21, 35 and 45 days at Figma's local clocks (18:55 from New York stays 18:55
  across daylight saving); a dated fare closes the day before it leaves; undated fares and the offers stay valid 19–60
  days; the three requests were made 1, 3 and 20 days ago for trips 3–9 weeks ahead, with the fixture's timeline moved
  by the same amount; the London offer names the month its flight leaves. The plan is a pure function of the clock,
  so a test fixes it on any date.
- **Rewritten in place, every deploy.** Fixed ids and keys (`staging-demo:*`), one multi-row upsert per table
  (`SET col = excluded.col`), then everything the account did since, undone: the requests it made, the offers it
  tapped, the preferences it saved, every inbox row (written again whole), another home airport, a password changed in
  the app (put back to the environment's). The row count returns to the clean state's; the account's phones keep their
  sign-in. An account a tester deleted is made again, and the demo rows follow the new id. `infra/deploy.sh staging`
  runs it as step 7, after the API and worker are up, with the migration's direct Postgres URL; a failure there is
  announced but does not undo a deploy that already serves. Between deploys, the RUNBOOK's one command runs it by hand.
- **Never production, never a real member.** The script refuses any database whose host is not `postgres-staging` or
  `pgbouncer-staging`, unless the host is local, the process is not in production mode and `APP_ORIGIN` is not
  production's — a laptop or CI. `deploy.sh production` does not call it. The review account in production stays what
  it was: an account, no data. And `ensureReviewAccount` refuses an e-mail that names a linked member or an operator:
  a wrong `REVIEW_ACCOUNT_EMAIL` is a mistake in the environment, not an account to take over.
- **What stays as the server has it.** The requests are already "sent" (`sent_to_crm`, a `staging-demo-*` CRM id), so
  `send-requests` never picks them up and no e-mail reaches an operator. The inbox rows are `sent`, so `dispatch`
  never pushes them. The fixture's fourth request, "not sent", is the app's offline queue, which the server never holds.
  The poster route JFK → ZRH keeps **no fare** on purpose: the estimate of ADR-IMPL-037 is shown there (the fixture's
  destination list prices Zürich, Frankfurt and Madrid, but has no fares for them; adding fares needs a carrier the
  fixture does not name — the owner's call, not this ADR's).
- **Observability.** The script prints counts and the date it used, never the e-mail or the password; errors print the
  innermost message only (drizzle quotes a query's parameters in its own).

**Consequence.** After the next staging deploy the review account shows Figma's Explore, feed, requests and inbox,
and keeps showing them, dated from the latest deploy. Flight clocks are real: in the week New York still has summer time
and London does not, BA 178 lands at 06:00, not 07:00. The e2e workflow keeps its own seeding (`db:seed`,
`seed-fixture-auth.ts`, the fixture member Alex Morgan with the fixture password) — unchanged.

**Rejected.** Relaxing `db:seed`'s guard for staging — the fixture is dev/test data with fixed dates, and the guard is
the only thing between it and production. A `DEMO=1` environment variable — one more line that must never reach
`production.env`; the database host is a fact, not a setting. A daily refresh job — a job in the API for data the API
should not know about, and nothing between deploys changes the dates by more than the deploy cadence does. Per-tester
copies — five identical data sets, five accounts to keep, for one demo. A separate demo account — one more credential
to hold, for an account the stores already require.

**Follow-up.** When the company's catalogue import feeds staging (`POST /v1/internal/catalog/import`), the fixture's
fares are no longer needed there; the script then keeps only the account, the offers, the requests and the inbox.

**Amendment — 16 Oct 2026: the image runs the script.** No staging deploy refreshed the demo: step 7 warned (`the demo
data did not refresh`) with `Cannot find module '@bbc/shared/events' from '/repo/scripts/seed-review-account.ts'`. In
the repository `scripts/` takes its imports' paths from the root `tsconfig.json`; the API image copied only
`tsconfig.base.json`, so Bun fell back to `@bbc/shared`'s exports (`./*` → `./src/*.ts`), which name no folder — and
`@bbc/shared/events` is one (`events/index.ts`). The image now carries the root `tsconfig.json` (`apps/api/Dockerfile`,
its build stage), and `seed-staging-demo.test.ts` checks that it does. Reproduced in the image's layout: without the
file, that same error; with it, `staging demo ready`, twice. The same fall-back stopped `seed-review-account.ts` and
`loadtest-staging.ts` when run by hand in the image (RUNBOOK, `docs/perf/LOADTEST.md`); they resolve now too. The API
itself was never affected: `apps/api` and every package have a `tsconfig.json` of their own.

**Amendment — 22 Oct 2026: the fixture seed's offers are withdrawn.** Staging held the fixture seed's offers
(`fixture:*`) beside the demo's (`staging-demo:*`): Paris and Tokyo twice on Explore, which does not dedupe. In its
transaction the script now withdraws every active `fixture:*` offer as `POST /v1/internal/offers/:id/withdraw` does —
the proposals module's `withdraw` (status `withdrawn` and `offer.withdrawn`), so its consumers close what they hold for
the offer and suppress its pending pushes. To reach them the event is published through the app's own wiring:
`seed-staging-demo.ts` builds the app as `loadtest-staging.ts` does (`buildApp`, role `api`, no poller) instead of
`scriptAuth`, whose registry knows no consumer; the worker delivers the event. A second run finds none active and
publishes nothing. Tested in `apps/api/test/staging-demo.test.ts`.

**Amendment — 25 Oct 2026: a withdrawn demo offer stays withdrawn (ADR-IMPL-067).** Once the company site's deals are
on, the demo's broadcast offers (Paris, Tokyo) are not what staging's members should see — Tokyo would stand twice on
Explore. An operator withdraws them once through `POST /v1/internal/offers/:id/withdraw` (RUNBOOK, "Staging demo
data"); the script's upsert no longer sets a withdrawn demo offer back to `active` (its dates still move) and writes no
inbox item for it, and its count of offers is the ones members can see. Tested in `apps/api/test/staging-demo.test.ts`.

**Amendment — 30 Oct 2026: nothing every member sees.** The catalogue and the broadcast offers are every member's, so
the demo's fares (five pins) and its Paris and Tokyo offers stood on every staging member's Explore — the testers'
included — beside, or instead of, the club's real data, and every deploy wrote them back. That breaks the decision
above: the demo is the review account's. The script now writes only what is the account's alone — its personal London
offer, its three requests, its inbox (the quote and that offer, unread) — and, in its transaction, retires what earlier
runs wrote for everyone: the active `staging-demo:paris` and `staging-demo:tokyo` offers withdrawn as
`POST /v1/internal/offers/:id/withdraw` does it (with the fixture seed's `fixture:*`, as before), and the fixture's fares
unpublished as `expire-fares` takes a fare off sale — the rows stay, since the demo's requests name fa01 and fa03 and
record their price, published price and airline themselves. The catalogue's own fares are not touched. A second run
finds nothing to retire and publishes nothing; its log line says how many it retired. The London offer's month still
follows BA 178's departure, 21 days on at 18:55 New York, now computed without a fare row. Staging shows the company
site's data once its flags are on (ADR-IMPL-045, 063, 067; RUNBOOK). This supersedes the Follow-up above and the
operator's step of the 25 Oct amendment: there is nothing left to withdraw by hand. Tested in
`scripts/seed-staging-demo.test.ts` and `apps/api/test/staging-demo.test.ts`.

The same day, staging turns its real data on by itself. Step 7 of `deploy.sh staging` runs `scripts/staging-real-data.ts`
after the demo: `catalog.estimates`, `catalog.site_prices`, `catalog.site_pins` and `catalog.site_offers` on, each
flag's other settings kept, under the demo's own guard (staging's database or a local one). It never prints a price
rule — only whether they are loaded. When it turned a flag on, the deploy starts `sync-site-destinations` in the worker
at once (5 s of waiting; the run goes on). `catalog.site_photos` stays as it is: the site's photos wait for the
company's word on the rights. `STAGING_REAL_DATA=off` in `staging.env` skips the step, so an operator's own setting
holds; production never runs it. Tested in `scripts/staging-real-data.test.ts` and `apps/api/test/staging-real-data.test.ts`.
