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
  estimate (ADR-IMPL-037). A cabin change re-runs the search; travelers only prefill the request.
- **The indicative fare** — `useSearch` now keeps `estimate` and the server's `from`/`to` (with `tz`). With no fare and
  an estimate: `INDICATIVE FARE` + the local time, then `EstimateRow` (`packages/ui/src/cards/EstimateRow.tsx`:
  FareRow's shape, `≈` where the carrier mark sits, `From $2,055 · round trip`, `ESTIMATE · NO PUBLISHED FARE YET`,
  `Indicative · your specialist confirms the fare`, no price slot) and the footer pill. With no fare and no estimate:
  `noFareCopy` — `Let us find your fare.` when the route touches North America (`US`, `CA`, `MX`), `Fares from <city>
are on request.` otherwise. The formula prices only routes touching North America (ADR-IMPL-037), so the rule is
  correct wherever an estimate could have existed; the three codes live in the app until the server sends a coverage
  field (P1b).
- **Local time** — `localTimeLabel(city, tz)` → `LONDON · 8:42 PM`, re-rendered on the minute, at the right edge of the
  fare-list label (`SectionLabel.trailing`). `AirportVM.tz` is already dropped by the contract when the runtime cannot
  format in it, so a missing zone means no label, never a wrong one.
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
`build-draft.test.ts` (dates from today, the cabin/travelers precedence), `home-sheet-snaps.test.ts`. `parity.yaml`
walks Cancel → pin → chips → the calendar → the profile pill. On staging the indicative fare appears once the price
rules and `catalog.estimates` are on (RUNBOOK, "Price rules for estimates"); until then the route falls to
`Let us find your fare.` — the correct state. Not here: `Popular from New York` and the suggested home airport
(ADR-IMPL-039's endpoints; the next commit), the globe's instant start, flight and night (A6; after G1), haptics (a
native build).
