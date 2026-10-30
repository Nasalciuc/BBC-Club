# ADR-IMPL-078 — The app says agent, not specialist

Status: proposed · Date: 2026-10-28 · Scope: the words a member reads or hears — `apps/mobile/src` (screens, sheets,
`accessibilityLabel`s, the call buttons' labels), the quote-ready push (`packages/modules/core/notifications`), the
fixture and the staging demo — and the documents that quote them (`DESIGN.md`, `design/components.md`,
`docs/release.md`, `packages/ui`'s comments).

**Context.** The people who call members back and book their trips by phone are the company's agents. The app called
them "specialist", which the owner (Scaler) named a mistake in the copy on 2026-10-28: a member who is told "Call your
agent" on one screen and "A specialist will call you" on the next meets two words for the same person.

**Decision.**

1. One term, **agent**, in every word a member reads or hears: the screens and sheets, the spoken labels, the push
   that says a quote is ready, the fixture's notes and the staging demo. "A specialist" becomes "an agent", "your
   specialist" becomes "your agent"; the words around them and their apostrophes stay as they were.
2. The call buttons are `Call your agent` (a request the club holds, the rate-limit page) and `Call an agent` (the
   update and maintenance pages); Profile's `Call us` is unchanged. The request detail's call kind is `"agent"`.
3. Comments that quote a member-facing text follow it. Comments, test names, e-mails and CRM fields that talk about
   the company's people as the team that reads requests (`OPERATORS_EMAIL`, "the specialists' e-mail") are not
   member-facing and stay as they are.

**Consequences.**

- The entry (Welcome, Sign in, Join, Verify, Set password, Reset) does not use the word and does not change
  (ADR-IMPL-046, ADR-IMPL-047).
- Older ADRs keep "specialist": they are history.
- The generated reference images in `isolated/bbc-club-3.0-design/final/` may still read "specialist"; `DESIGN.md`
  wins where an image and it differ (ADR-IMPL-055).
- A build that has not taken this change still shows "specialist" until it updates; the server's push says "agent"
  from the deploy on.
