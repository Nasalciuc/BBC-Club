# ADR-IMPL-041 — Home as Figma draws it

Status: accepted · Date: 2026-10-08

**Context.** Every section of the Figma file (`nYP9gogb6hnpKxfpKiCc4g`, 04 · Screens and 07 · Additions) was read frame by
frame against the code on 8 October. Entry, Onboarding, Fare detail, Request, Requests, Profile and the system screens
match. Home did not: no header (the wordmark and the `AM` pill that opens Profile, 89:386), no way out of typing (89:388
has `Cancel`), preference chips that were stubs (`Dates` set 12–19 October 2026 on press; the cabin and the travelers
toggled), a dashed link where Figma docks a `Request a quote` pill (89:387), the search placeholder `Where to?` instead
of `Where would you like to go?`, no `See all`, the offline state as a banner over the globe instead of the in-sheet
state (89:391), and nothing from the owner's additions of 7 October: the indicative fare row and the destination's
local time (536:10635, 536:10864), `Fares from Chișinău are on request.` (536:11155). The request sheet also opened
with the same fixed dates whatever the member had chosen.

**Decision.**

- **Header** — `features/explore/ExploreHeader.tsx`: the wordmark in `labelMono` and, at the right, the profile pill
  (initials from `displayName`, never from an e-mail; the `user-circle` icon without a name) that opens Profile, or
  `Cancel` while typing, or `Done` while the offers are expanded. Nothing else ever sits there.
- **Two pages** — Rest, a route with fares and the indicative fare keep the night page and the globe (89:386, 89:387,
  536:10635). Typing, Expanded, Zero results and Offline are drawn on the porcelain page without the globe
  (89:388–89:391, 536:11155): the drawn globe unmounts, the Mapbox globe stays mounted but is not displayed (it keeps
  its tiles and camera; nothing moves under a covered sheet) and the header turns dark. One derived flag in
  `explore.tsx`; no second screen. Offline counts only while the route has nothing on screen: fares already shown stay
  through a connectivity blip, and a search in flight keeps the page it started from (no night ↔ porcelain bounce).
- **Sheet detents** — `HOME_SHEET_SNAPS = [0.39, 0.71, 0.85]`: Figma's 300 / 544 / 656 pt sheets on the 768 pt container
  above the tab bar. Never 100%: the header's Cancel / Done stay reachable above the sheet (Motion spec 7).
- **Preference chips are real** — `Oct · flexible` opens the shared `DatesSheet` (the Calendar); `Business` and
  `1 traveler` open two small sheets of their own (`SearchPreferenceSheets.tsx`) that change this search only — the
  profile's defaults stay where the member set them. Labels and the mono summary of the empty states come from
  `travel-preferences.ts` (`1 traveler`, never `1 adult`). A chosen departure day goes to `GET /v1/search` as `when`
  (noon UTC of that day: the fares valid then); flexible dates search undated, the only search that can carry an
  estimate (ADR-IMPL-037). A cabin change re-runs the search; travelers only prefill the request. The travelers sheets
  (Home's and Profile's) set the adults and keep the children and infants already in the party (`withAdults`, tested
  in `travel-preferences.test.ts`).
- **The indicative fare** — `useSearch` now keeps `estimate` and the server's `from`/`to` (with `tz`). With no fare and
  an estimate: `INDICATIVE FARE` + the local time, then `EstimateRow` (`packages/ui/src/cards/EstimateRow.tsx`:
  FareRow's shape, `≈` where the carrier mark sits, `From $2,055 · round trip`, `ESTIMATE · NO PUBLISHED FARE YET`,
  `Indicative · your specialist confirms the fare`, no price slot) and the footer pill. With no fare and no estimate:
  `noFareCopy` — `Let us find your fare.` when the route touches North America (`US`, `CA`, `MX`), `Fares from <city>
are on request.` otherwise. The formula prices only routes touching North America (ADR-IMPL-037), so the rule is
  correct wherever an estimate could have existed; the three codes live in the app until the server sends a coverage
  field (P1b). On a narrow phone or at a large font scale a line of `EstimateRow` may wrap; none is cut (DESIGN.md).
- **Local time** — `localTimeLabel(city, tz)` → `LONDON · 8:42 PM`, re-rendered on the minute, at the right edge of the
  fare-list label (`SectionLabel.trailing`). `AirportVM.tz` is already dropped by the contract when the runtime cannot
  format in it, so a missing zone means no label, never a wrong one. When the label and the time do not fit on one
  line with 12 pt between them (a narrow phone, a long city, a large font scale), the time wraps under the label;
  nothing is cut.
- **Footer** — `HomeSheet.footer`, rendered through gorhom's `BottomSheetFooter` so it follows the sheet: the
  `Request a quote` pill docked 12 pt above the sheet's edge (89:387), shown with results or an estimate, never beside
  an EmptyState's own pill (one filled button per screen).
- **Typing** — the same `SearchField`, editable, with Figma's `Clear` text link (not an ×, everywhere the field
  appears), `AIRPORTS` over the matches while typing and over the suggestions before, `RECENT` below. Cancel restores
  the state before typing (a chosen destination stays).
- **Offline** — `useOffline` answers; `SheetSelected` draws the in-sheet `You’re offline.` state with `Try again`
  (which re-asks NetInfo, then re-runs the search). The banner is gone; Rest keeps the cached offers.
- **The request sheet starts from what Home knows** — `buildDraft` takes a `SearchContext` (dates, cabin, travelers):
  the fare's cabin wins, then the search's, then the profile's; the search's travelers, then the profile's. Without
  chosen dates it suggests two weeks out and a week long from today — the fixed `2026-10-12 / 19` is gone.
- **Smaller** — `See all` beside `OFFERS TO INSPIRE` expands the sheet; an offer without a price reads `EXPLORE`
  (89:389); `monogram()` moves to `lib/monogram.ts`, shared by Profile and the header; `@bbc/ui/calendar-logic` is a
  subpath export so pure modules (and their tests) take the date helpers without React Native.

- **Discovery in the app** (ADR-IMPL-039's two endpoints, 536:11093 and 536:11191) — before typing, the sheet asks
  `GET /v1/airports/popular?from=<origin>` and shows `POPULAR FROM <CITY>` (at most four, never a recent one or the
  origin) over `RECENT`; without an answer (an older server, a failure) the home destinations stand in under
  `AIRPORTS`, as before. Onboarding asks `GET /v1/airports/home-suggestion?tz=<phone zone>` once; with an airport it
  reads `City, airport or code — suggested from your time zone.` and offers that airport as one row under the empty
  field — offered, never chosen: the member taps it or types another. A zone that names no place (`UTC`, an
  abbreviation) asks nothing.

- **Interior pills are navy** — Figma's Button is `Tone: Primary` on every light screen (EmptyState, ErrorState,
  the request sheet, the calendar, the edit sheets, Fare detail, Continue); the code's `Button` defaults to `inverted`
  (the light pill of the dark Entry screens), so those call sites now say `variant="primary"`. The default stays, for
  Entry and for the confirmation screens, where Figma says Inverted.

- **One type system** (Figma 02 · Text styles; the owner's choice of 8 Oct) — Entry no longer keeps Inter, Source
  Serif 4 and JetBrains Mono: `constants/club.ts` reads every role from the generated tokens through `rn()`, so Welcome,
  Join, Verify, Set password, Sign in and Recovery set their type in Fraunces, Geist and Geist Mono like the interior.
  `_layout.tsx` loads only those (the splash waits for fewer files); the three retired packages leave `package.json`
  with the next dependency refresh, where `bun.lock` is regenerated. `DESIGN.md` says so, and records the one place
  Figma follows the code: `tab-mono` stays 11/13 (Figma's 9/9 is below the legibility floor the file sets).

**Consequences.** Home is the screen Figma draws, in every state, and the three preferences the member sets on it
reach the search and the request. Tests: `travel-preferences.test.ts` (labels, `when`, the North-America rule),
`local-time.test.ts` (clock, DST, missing zone), `search-reducer.test.ts` (an estimate only on an empty result),
`build-draft.test.ts` (dates from today, the cabin/travelers precedence), `home-sheet-snaps.test.ts` — in CI too: the
app's `test:unit` runs every test file (`bun test app.config.test.ts src`); a fixed list left eight out. `parity.yaml`
walks Cancel → pin → chips → the calendar → the profile pill. On staging the indicative fare appears once the price
rules and `catalog.estimates` are on (RUNBOOK, "Price rules for estimates"); until then the route falls to
`Let us find your fare.` — the correct state. Not here: `Popular from New York` and the suggested home airport
(ADR-IMPL-039's endpoints; the next commit), the globe's instant start, flight and night (A6; after G1), haptics (a
native build).

## A2c — Requests as Figma draws them (8 Oct 2026)

**Context.** Reading the Requests frames (233:4069, 233:4639, 240:5199), the request detail (233:4248 received, 325:8136
specialist review, 233:4171 quote ready, 233:4388 booked, 325:8229 closed, 325:8295 not sent) and Profile's recent
requests (233:4453) against the code for the city titles found more than the titles: the request was a bordered row
titled with its route (`JFK → JFK` for every round trip, fixed on the server by ADR-IMPL-042), with a call button and a
red `Tap to send` inside it; the badge was uppercase, grey-filled, and red for Not sent (`status-danger` is reserved for
a field at fault and the deletion confirmation); the timeline was dots and dates. The server now answers `city`,
`tripType` and `phone`, reads a request it gave up passing on as `not_sent`, and stores an estimate only when the app
says the member saw one (ADR-IMPL-042). A review of about 560 hypotheses on this work found the rest below.

**Decision.**

- **`RequestCard`** replaces `RequestRow` (Figma `Proposal / RequestCard`, 436:1169): the city as the title, the badge
  beside it, `JFK → LHR · BUSINESS` and `OCT 12–19 · 1 ADULT` in mono; Full on Requests, Compact on Profile, built by
  one helper (`requestCard`) so a request reads the same in both; 12 pt apart. No button and no chevron — calling and
  sending happen in the request. A request waiting on the phone reads `Your travel details are saved`; one that will
  not go out by itself (refused for good, or given up by the server) keeps its dates and its `Not sent` badge, and
  its detail offers the call; a closed one, when it closed (its latest `closed` event, in the phone's zone; `Closed`
  when there is none), without a badge. A long city
  widens its column and the badge moves to the next line. The title is the route when an older server names no city —
  never a route that comes back where it started (an older server read every round trip `JFK → JFK`): then
  `Your request`. A screen reader hears words: `London, quote ready, JFK to LHR, business, October 12 to 19, 1 adult`.
- **`StatusBadge`** as Figma 26:20, typed (`BadgeStatus`; the words in `status-copy.ts`, own keys only, tested):
  sentence case, only Quote ready filled, the others a hairline frame; 24 pt under a request's title; placed by its
  parent. **`Timeline`** as 46:114: a card, a check in a circle and a dark connector for what is done, quiet future
  steps, the current step's caption (a specialist's note on it wins — the latest one, so a second quote's note replaces
  the first); no dates; each step says `done`, `current step` or `not yet` to a screen reader.
- **The request's detail, frame by frame**: the city, the facts line `JFK → LHR · OCT 12–19 · ROUND TRIP · 1 ADULT`,
  the badge (or `Closed · Oct 3`); the sentence and, for a fare request, `YOUR FARE` with its price (`PricePair` gains
  Figma's Detail layout, 26:29: a 144 pt column, one element for a screen reader). `REQUEST PROGRESS` names the
  timeline on received, quote ready and booked — not on specialist review (325:8136) nor on not sent (325:8295).
  `WE WILL CALL`, the member's number (`displayPhone`) and the booking note on received and quote ready only;
  `Call your specialist` once a quote is ready (296:5916). 16 pt between groups on not sent, 24 on the others.
- **A request that will not go out by itself** — the server gave up passing it on (`not_sent`, ADR-IMPL-042) or refused
  the copy on the phone for good — no longer reads "Saved on your phone…", which was untrue: `We couldn’t pass this
on. Call us and we’ll take it from here.` with `Call us`, the screen's one filled button; the list's hint points at
  the call, not at a retry that does not exist (no frame draws this state — the owner's to confirm).
- **The offline queue never discards a request** (Figma's note on 325:8384, `Send now`): being offline costs no
  attempt; a server failure waits 1, 2, 4, 8, 16, then 30 minutes and is retried for as long as it takes; a refusal for
  good (400, 409) stays on the phone, saying so, for a week. The details are checked before a request is sent or saved
  (`RequestBody`; the note stops at 500 characters), so nothing is saved that could never leave. One submit at a time
  in the sheet (a double tap saved two), and one copy per Idempotency-Key. A flush re-reads the queue before writing it
  (a request saved meanwhile was overwritten); a blob that does not read is set aside once, an item that does not read
  on its own. Results are per request, so `Send now` reports its own. The queue goes out from anywhere — on sign-in,
  on return to the foreground, and when the phone comes back online — not only while Requests is open. While the app
  simply stays open, the next request due is tried when it is due (`flush-timer.ts`, online only): its back-off after
  a server failure, else 30 s — doubling after each try in a row that sent nothing, up to 5 minutes, so a server that
  does not answer is not asked every 30 seconds; Requests also sends what waits each time it comes into view. One
  flush at a time: a caller that saved nothing new is answered by the one running; a request saved meanwhile goes in
  the next, and `Send now` is answered only by a flush that sent its request or refused it — otherwise it makes its
  own try. After a sign-out a flush under way sends nothing more and writes nothing back. The requests on the phone are
  the signed-in member's: at sign-in, those another member left there (a session that expired, so nothing cleared
  them) are set aside for that member — never sent under this account nor shown to it — and come back when that member
  signs in again (`adoptQueue`). The new owner is written before any of their own requests come back, so an app stopped
  half-way through never leaves one member's requests under another's name: the next time a member is signed in finishes
  the move. `Send now` goes even if the request was waiting, checks the network first, one tap at a time, and says when
  it did not go (`You’re still offline…`, `It didn’t go through…`) — to a screen reader too (iOS: an announcement queued
  behind VoiceOver; Android: a live region). Once the member has left the request, an answer arriving late does nothing.
- **Lists that follow the server**: Requests and Profile reload each time they come into view (they stay mounted under
  the tabs) and Requests when the phone comes back online; the spinner is for the first load only. A first load that
  fails is an error with `Try again`, never `No requests yet.`; with requests waiting on the phone, those stay on
  screen and one line says the others did not load (`We couldn’t load your other requests just now.`); a later one
  keeps the list and says so in `text-secondary` (never `status-danger`); offline says when the list loads, not
  "We'll send this…". Profile writes the phone as the frames do and leaves out recent requests that did not load; one
  24 pt gap above them, and above `Your account.` when they are left out. Its recent requests are the three newest: the
  server's list puts requests in progress first (ADR-IMPL-042). A request the app cannot read at all is left out of the
  list (a state it does not know reads `received`, ADR-IMPL-042): counted, and logged in development only.
- **Navigation**: a screen pushed over the tabs (a request, a fare, a confirmation, the rate limit) has one tab bar,
  `RootTabBar`: a tab goes back down to the tabs beneath (`dismissTo`) instead of stacking another set, and the
  Requests dot is the real count of quotes ready on every bar (`useUnreadQuotes`). Each question for that count takes
  a ticket when it is asked and the newest one wins, whichever answer arrives first; it starts over at 0 for each
  member — a sign-in, a sign-out, a deleted account (`unread-quotes-store.ts`). After `Send now` the detail returns
  to the Requests beneath. Back with nothing beneath (a link at cold start) lands on Requests.
- **Links**: a tapped push opens its request (`deepLink`, the quote-ready push) — on Android from `content.data`, on
  iOS from the remote push's own keys (`trigger.payload`: expo-notifications fills `content.data` only from a `body`
  key) — once, even when a cold start hands the same tap over twice. The first link the app routes wins: an empty or
  unknown one in `content.data` never hides a good one further on. The launch URL is taken once per process, and
  every link waits until the member is signed in and past the gate (`linkCanOpen`). `+native-intent.tsx` keeps Expo
  Router from routing the club's links itself (`requests/<id>` matches no screen file: "Unmatched Route").
- **The quote says whether the estimate was on screen** (`estimateShown`, ADR-IMPL-042): only when Home showed the
  indicative fare for that route and cabin, and only while the quote still asks about them — a yes, never a number.
- **The confirmation** (135:856) writes the number this request will be called on — the request's own (the server's
  reading of it, else the one the sheet sent), not the profile's — as `+1 (212) 555-0148`, and the trip's facts under
  the city. Saved on the phone, it asks nothing of the network.
- **A busy button keeps its name** for a screen reader (`Button`, `packages/ui`): while it shows a spinner, it is still
  `Send now`, busy. A fare page's price pair is one element too, as the detail's: `Your fare $3,900, down from $7,550`.
- **A request still on the phone** keeps the destination's city in the queue (optional: items queued before read as
  before) and is read with the server's own `requestRoute` and `requestDates` (`@bbc/shared/requests/display`).
- `apps/mobile`'s `typecheck` checks the tests too (`tsconfig.test.json`), as `test:unit` already runs every test file
  (`bun test app.config.test.ts src`, since PR #63).

**Conflicts and deviations, reported, not resolved** (CLAUDE.md) — each the owner's to decide:

- Figma 233:4204 colours a request's price bronze; `DESIGN.md` keeps `accent-warm` to the selected pin, a fare row's
  offer and the Requests dot. The price stays `text-primary`.
- Figma 26:20 sets the badge in `caption`, sentence case; `DESIGN.md` gives `caption` to non-essential lines and
  labels to `label-mono`. The badge follows Figma.
- Figma 296:5916 draws `Call your specialist` as a white pill; `DESIGN.md` makes secondary actions `text-link`. The
  pill follows Figma.
- The framed badge sits on `surface-card` (Figma: transparent) so its words keep 4.76:1 on the porcelain page;
  transparent they read 4.35:1, under `DESIGN.md`'s 4.5:1.
- `REF R-…` under the sentence is in no detail frame; it stays — it is what the member reads out on the phone.
- The not-sent-by-the-server state, its sentence and `Call us`, the two lines under `Send now`, and the line over the
  requests waiting on the phone when the others did not load are in no frame.
- A request the server refused for good (400, 409) leaves the phone a week after the refusal (`REJECTED_KEPT_MS`),
  having asked the member to call all that time; Figma's note on 325:8384 says never discard it.
- Figma 325:8525 (Edit · Phone invalid) sets a field's error message in red; `DESIGN.md` and `design/components.md`
  give it `text-secondary`, the field's border carrying the fault. The request sheet's error lines stay red, as Figma
  draws them and as they were before A2c.

**Consequences.** Requests, the detail and Profile's recent requests read as the frames do; the deviations above are
listed. With an older server the title falls back to the route (or `Your request`) and the detail omits the trip type
and the number — so this release's OTA goes out in an environment only after the API with ADR-IMPL-042 runs there.
`EXPO_PUBLIC_SUPPORT_PHONE` must be set in the EAS environment for any call button to show (`docs/release.md`). Not
here: Profile's home-airport photograph and its Edit / Call us pair (233:4453; built since in ADR-IMPL-043), the
published fare on a request, a specialist's own number (Figma's note on 296:5916 asks for it from the backend; until
then the call goes to the club's line), and parity screenshots of the detail frames (the e2e fixture seeds no
requests — a seed for each state belongs with it). Tests: `request-card.test.ts` (the card and detail lines, the title
fallback, the spoken label, a queued request read with the server's functions, closed with and without its event, in
the phone's zone),
`request-view-logic.test.ts` (every frame's parts, the not-sent states, closing dates in the phone's zone, the hints,
the dot, the three newest), `queue-logic.test.ts` (never discarded, back-off, refusals kept, results applied by id,
item-by-item parsing, when the next try is due), `queue.test.ts` (the queue with its storage in memory: what is saved
and set aside, one flush at a time, `Send now` during a flush and answered only by a final outcome, a sign-out
mid-flush, whose requests they are, a sign-in stopped at any write), `flush-timer.test.ts` (the open-app retry: its
waits, offline, a sign-out, a re-entrant read),
`build-draft.test.ts` (`estimateShown`), `deeplink-logic.test.ts` (a tapped push on iOS and Android, native intent,
where a link waits), `error-context.test.ts` (reading copy, offline and refresh), `status-copy.test.ts`
(`packages/ui`), `phone.test.ts`.
