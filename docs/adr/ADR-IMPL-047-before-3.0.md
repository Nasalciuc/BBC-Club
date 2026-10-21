# ADR-IMPL-047 — Before 3.0: what members and testers hit, test data that outlives November, two holes on the server

Status: accepted · Date: 2026-10-18 · Scope: P1 (app, API, infra, the agents' files) · Amends ADR-IMPL-020 (point 3:
how a change ends the other sessions).

**Context.** Two audits of `main` at `108592d` (16 Oct 2026; the project and the UI/UX, each finding checked by
independent sceptics) and a walk on the owner's phone found defects that a member, a tester or CI meets before 3.0
starts. The owner's direction for 3.0: the entry stays exactly as it is; everything after onboarding is upgraded. These
come first because each would otherwise be carried into 3.0, or stop it.

**Decision.**

- **Test data that outlives November.** The fixture's Paris offer ends on 31 Oct 2026, Tokyo's on 30 Nov. The seed
  leaves `publish_at` to `now()`, and CHECK `offers_valid_after_publish` refuses a validity at or before it; Postgres
  checks the CHECK before ON CONFLICT, so from 1 November the whole seed rolls back on fresh and kept databases alike —
  `e2e-android` (nightly, and on every PR that touches `apps/mobile/src`, `packages/ui` or `packages/shared`) and
  `bench` red at their seed step. The seed now moves a validity with a day or less to run on by whole years, same day and
  time (`packages/db/scripts/fixture-dates.ts`); the fixture itself is unchanged. Reproduced on Postgres 16.15 with a
  past date: before, `violates check constraint "offers_valid_after_publish"`; after, `fixture seeded`. A database
  seeded before keeps the rows it has — the seed adds only what is missing — and with them their dates; CI's and
  `bench`'s databases are new on every run.
- **The status bar.** One global light bar painted white glyphs on the porcelain pages (1.09:1). The root keeps it for
  the entry and Welcome; every screen on another surface mounts `ScreenStatusBar` while it is focused — dark glyphs on
  porcelain, light on the night, the fare's photo band and the confirmations' photograph or globe; the update and
  maintenance pages take the dark ones.
- **The keyboard on the entry (Android).** The entry's `KeyboardAvoidingView` had no Android behaviour, and edge to
  edge the window no longer shrinks for the keyboard: the primary button sat under the keys on all five entry screens
  (PR 43 follow-up #1; met on the owner's phone). `padding` on both platforms. While the keys are up, the photograph
  gives way to the fields — only the back button and the logo stay above the panel — and the footer no longer adds the
  navigation bar the padding already counts: the button stands above the keys and the field being typed in stays in
  view. `DESIGN.md` puts the panel at 25% with the keyboard open; on Sign in that leaves its password field out of view
  on a 411 × 914 pt phone (CI's Pixel 6) and on a 393 × 852 one, under a footer of two buttons, so the owner kept the
  photograph's giving way (18 Oct) — a conflict with `DESIGN.md` for 3.0 to settle. `sign-in.yaml` no longer closes the
  keyboard before `signIn.submit`: CI's emulator checks it. Amended 21 Oct: on the owner's phone the keyboard's row of
  saved addresses still cut the password field under Sign in's footer, so while the keys are up that footer keeps its
  button alone; the divider and `Create account` come back with the keys down, and the screen without them is unchanged.
  The same day, on Welcome: its two sentences run as one headline (`suite. Land rested.` share a line) and the subline
  takes the column's full width (`around you.`), so no word stands alone on a line.
- **The entry's errors.** The entry stays as it is, but its error line was `#B42318` on the navy panel, 2.23:1, and
  `DESIGN.md` keeps `status-danger` off messages (`design/components.md`: the message in the secondary text colour).
  The line now takes the entry's muted text, `textOnDarkMuted` (`#94A3B8`, 5.71:1) — no colour outside the palette
  (the owner's choice, 18 Oct, over a lighter red, `#F97066`). The entry's fields never drew the red border `DESIGN.md`
  gives the field at fault; that stays for 3.0. `constants/club.ts` holds the entry's colours, spacing and radii by
  hand, so a token change of 3.0 does not reach them (its type roles and its buttons do read the generated tokens).
- **Android's Back.** It ignored the thirteen modal sheets (Back on the request sheet left the fare page, the draft with
  it), Explore's typing and expanded sheet, and onboarding's airport step. `ModalSheet` closes on Back as its × does,
  and does nothing while it has no way out (a request sending); Explore and onboarding answer as their Cancel and Done do.
  Each sheet's listener is added once per opening and keeps its place (`closable` is read through a ref): a sheet under
  another one whose send ends does not move above it.
- **States.**
  - The fare page's `Try again` went back; it now loads the fare again — unless the fare does not exist (404, a link):
    "This fare is unavailable.", with no `Try again`. The fare page and the request's page keep their back button and
    the tab bar while they load and when they did not.
  - The network layer's offline line promised "We'll send this when you're back." in some twenty places that send
    nothing. It now says "You’re offline. Try again when you’re back online."; only the request queue sends later, and
    its screen says so itself (Figma 135:855). A page that did not load says the same and waits for its `Try again`;
    a timeout is the page's own message, on the requests list too — the phone is online, and nothing reloads by
    itself. Only that list, which loads again once the phone is back online, still says it will when offline.
  - Explore no longer hides its search when Home did not load, and no longer draws a spinner under its own skeletons;
    its full sheet, which has none, keeps the spinner while Home loads — never "No offers yet." before Home answered.
  - Settings, Edit profile and Profile no longer show values made up while they load ("Add phone", "Business",
    "1 adult", "Member"): the rows wait, dimmed; a profile that did not load is a message with `Try again`, which
    takes the message away at once while it loads again. Profile's
    gear stays above that message — Settings is the only way to Sign out and Delete account — and Delete account
    waits for the load too: its confirmation counts the open requests it closes, or, when they did not load, says that
    any open requests are closed.
- **Release builds.** The dev gallery opened as a blank page with no way back (a link, or Expo's sitemap, reached it): it
  now sends a release build to the app's start. An unknown link opened Expo's "Unmatched Route" with its sitemap:
  `+not-found` is now the page-wide message.
- **The globe** kept turning and re-rendering five times a second with Explore out of view (another tab, a fare pushed
  over it). It now pauses there, still drawn.
- **One source.** `constants/club.ts` repeated the tokens by hand and had drifted (porcelain `#F8FAFC` against
  `#F4F5F4`); the root layout used its porcelain behind the light screens. It is now the entry's file and says so; the
  root's light screens and everything inside the club read the generated tokens.
- **The server.**
  - Operator links were signed and checked with an empty secret whenever `OPS_LINK_SECRET` is unset — every CRM adapter
    but `email`, staging's mock included — so anyone could make one and set a request's status. `verifyAction` now
    refuses an empty secret.
  - Caddy's `/media/*` sent the whole of MinIO, its S3 API and its admin API, to the internet on both domains. Nothing
    uses it before R1b: the route answers 404, and MinIO is reached through the SSH tunnel only, as the RUNBOOK says.
  - `POST /v1/account/password` had no limit at any layer — the current password could be guessed there without end. It
    now counts as `profile.write`, with the numbers of the profile's other writes but a bucket of its own (`pw:` before
    the member), so ten wrong guesses do not stop the member's profile edits, nor do the edits the guesses. A change
    used to end every session, the one that made it too: Better Auth put that session's replacement in a cookie the
    route does not forward, and the phone was signed out once its cookie cache ran out (60 s in production). The
    change now ends every other session and keeps this one (`revokeOtherSessions` after it; ADR-IMPL-020's point 3
    called `changePassword` with `revokeOtherSessions: true`). This session keeps its token — another device is the
    case a change answers; a copy of this phone's own cookie would need the reset by email code, which ends every
    session. Should ending the others fail after the password changed, the change stands and `member.password_changed`
    is published, but the answer is never `ok`: a 500 that says the other devices are still signed in, and the way that
    ends them all (sign out, then the reset by email code). It carries `context.passwordChanged`, so the app shows the
    change as made, with those words, and never the form again (the old current password would now be refused). The log
    line names the error and its SQLSTATE only: a failed query carries its parameters, the other sessions' tokens among
    them. Better Auth's own routes,
    which the app never calls, checked it as well: `/api/auth/change-password` let a session try three passwords every
    ten seconds from each address, `/api/auth/verify-password` sixty a minute. Neither is served any more
    (`disabledPaths`); the club's route reaches `changePassword` from inside the server. `/api/auth/delete-user` stays —
    the app deletes an account there — at three tries an hour from each address. A reset by email code left every
    other session alive for 30 days: `revokeSessionsOnPasswordReset` signs them out, and the app signs in again with the
    new password.
- **The agents' files** pointed to documents that never existed (`docs/ARCHITECTURE_MASTER.md`, `REBUILD_PLAYBOOK.md`,
  `docs/FLOWS_DEEP_DIVE.md`), to retired fonts, a product "with no search" and a token file that is not the source, and
  none said that Figma wins (ADR-IMPL-046). `AGENTS.md`, `CLAUDE.md`, `.cursor/rules` and `README.md` now say what is so.

**Consequence.** After the merge: a staging deploy (step 8 gives Caddy the new Caddyfile), then one OTA — JavaScript
only, runtime 0.2.0. On the phone: the clock on the porcelain pages, `Sign in` above the keyboard, Back closing a sheet,
an error on the entry that can be read.

**Not in this ADR.** The owner's decisions: the waitlist rule (every member who joins alone stays `waitlist` and gets
no push, the quote-ready one included), marketing pushes on by default against the app's consent copy, and 3.0's
design. Platform semantics that need an ADR of their own: the kill switch that drops deliveries instead of pausing
them, the journal tombstone that dead-letters a late `member.deleted`. A box to test it on: `infra/restore.sh`. With
R1b, before MinIO serves anything: its user and password as keys bootstrap requires. Dates that run out in 2027, a
sweep of their own before then: `fa01`, the fare the flows open, ends on 31 Dec 2027, and so does the London offer as
`apps/api/test/parity.test.ts` ingests it; several API tests ask for flights on 12 Oct 2027. Files from the owner: the
app's icon, a web page for account deletion. iOS: the Apple Developer account.
