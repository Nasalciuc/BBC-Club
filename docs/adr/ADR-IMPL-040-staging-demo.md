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
