# ADR-IMPL-046 — The shared components as Figma draws them

Status: accepted · Date: 2026-10-13 · Amended 2026-10-14 by the screens' sections at its end (F2 onward).

**Context.** On 13 October every frame of the Figma file (`nYP9gogb6hnpKxfpKiCc4g`: 04 · Screens and 07 · Additions,
99 frames) was set beside the app rendered at the same size, 393 × 852 pt, and measured. Almost no screen matched:
1,011 differences, 312 of them large. The audit of 8 October (ADR-IMPL-041) had compared words only — a screen whose
sentence was in the code passed. Many screens were built from `DESIGN.md` and the older HTML sketches, which differ from
Figma's 03 · Components: buttons with an arrow, 36-pt pills for chips, rows on hairlines, sheets without a backdrop, a
calendar of its own. The owner's rule, 13 October: Figma is the source; where `DESIGN.md` contradicts it, Figma wins,
except what the owner approved (the satellite globe, the additions A1–A6, the header's avatar opening Profile, the fare
row and the calendar's one band of 13 October, the 11-pt tab labels). The components come first: every screen is built
on them, so each one moves dozens of screens at once. Four bugs were found on the way.

**Decision.**

- **Button** (7:12) — 56 pt, pill, the label alone: the `arrow` prop is gone. `busy` keeps the tone and reads the
  caller's `Sending…` / `Saving…` (7:10) — no spinner. Primary disabled is `surface-muted` at 50 % with its label in
  `text-on-dark-muted` (7:8); the other tones dim to 45 % (66:182). Secondary is white on a hairline (7:6): the
  transparent `ghost` and the outlined button on navy are gone, and `shape` with them (Figma's button is a pill).
- **The entry stays as it is** (the owner, 14 October): its screens — the welcome, Join, the code, the password, Sign
  in and the recovery — are not brought to Figma, and keep their own button, `club-button`: the light pill with the
  arrow after the label, Sign in's outlined `Create account` under NEW TO THE CLUB, 45 % while it cannot be pressed.
  It no longer borrows `Button`; no entry screen changes.
- **Chip** (26:8) — 48 pt, the field's 12-pt radius, the label alone (no icon), selected the navy fill, disabled 40 %.
  `fill="equal"` shares the row (Round trip / One way, 135:849; the onboarding cabins, 72:314); `fill="content"` grows
  from its own width so Explore's three preferences span the sheet, padded 12 (52:23); `size="lg"` is 56 pt — the cabin
  sheets' two cabins, one under the other (238:4710).
- **SearchField** (28:42) — the magnifier in every state (no plane once filled); the placeholder in `text-secondary`,
  as in the request's, the password's and the phone's fields (Figma's fields are that one component's states; the
  entry's follow with its screens); focus thickens the border to 1.5 pt `text-secondary`; `error` is the danger border;
  disabled dims the whole field to 40 %. A route's prefix reads in the field's own type (`JFK → London · LHR`, 52:23).
- **AirportRow** (28:65) — a white row, 72 pt: the city over the airport's name, the IATA code in mono at the right;
  `selected` adds the border and the check on `surface-page`, `recent` the clock. No flag (the flags module, a grey
  stand-in, is removed) and no plane pill. Rows stand 8 pt apart in the sheets (238:4561, 72:222), 12 in Explore's
  typing (52:35).
- **ListRow** (37:72) — a white card, 64 pt, 12-pt radius: the label, its value at the right, a 20-pt chevron in
  `text-secondary`; disabled at 40 %; `toggle` puts a 48 × 28 switch in a 48 × 44 target where the chevron was. Rows
  stand 8 pt apart.
- **Stepper** (47:46) — a white card on a hairline, 80 pt; minus and plus are 48-pt squares with the field's radius on
  `surface-page`; a bound dims its button to 40 %.
- **EmptyState** (48:18) and **ErrorState** (50:54) — left-aligned across the parent: the 28-pt headline, the body, 24
  pt to one primary button across the width. The ErrorState's second action is Figma's support link — 15 pt,
  `text-secondary`, 48 pt high, `Call a specialist` in Figma — not a second button. The parent gives the 24-pt gutters.
- **CloseButton** (299:200) — the 32-pt circle filled `border-default`, the × 14 pt across. **BackButton** (299:197) —
  the chevron 6 pt from the target's left edge (centred on the white plate a fare's photograph gives it).
- **TabBar** (41:39) — white, no rule above: 4 pt, the three 48-pt targets sharing the width, then the bottom inset —
  at least Figma's 32 pt. The bar takes the inset itself (`bottomInset`), on the tabs and on the screens pushed over
  them: the tabs' layout padded the screen instead, and the Stack's black showed under the bar on every phone with a
  home indicator (bug 4).
- **Calendar** (322:1446, 322:212, 322:741) — 48-pt days in a 336-pt grid centred in the sheet; the selected circle 48
  pt; the range band 32 pt high, 8 pt from the day's top; the digits in `body-sm`, the weekdays in `caption`, the month
  in `title-sm`; 12 pt between the month, the weekdays and the days, 24 between months. This corrects ADR-IMPL-041's
  note that Figma had no calendar.
- **ModalSheet** (new; the sheets of 04 · Screens) — the page under a 35 % `surface-night` backdrop (a tap closes it,
  except while a request or a save is in flight); the sheet in `surface-page` with 24-pt top corners and a 48 × 4
  handle 8 pt from its top; Figma's four heights, from the sheet's top on the 852-pt frame — `tall` 104 (the edit
  sheets, the request, the calendar), `explain` 256, `medium` 224 (a question or a confirmation), `short` 360 (one
  field). The header 24 pt down: a 20-pt title in 44 pt, or a 28-pt headline in 64 for a question or one field, then
  the filled × — after a 257-pt (281-pt) title box, as Figma lays the header out, so the × stands 36 pt (12) inside the
  gutter. The content from 88 pt (120 under a headline; 96 on the request sheet and About this fare), its blocks 24 pt
  apart; the actions pinned at the bottom, Figma's distance above the sheet's edge (68 on a tall sheet, 48 under a
  question, 108 under one field) — on a phone shorter than the frame that distance gives way first, point for point, so
  the calendar keeps its months — and never closer than 12 pt above the home indicator or navigation bar. With the
  keyboard up the sheet rises above it but never under the status bar (`insets`), its actions 12 pt over the keys;
  inside a sheet the search field is gorhom's input too (`InModalSheet`), so the sheet rises for it as for the others.
  Each new error comes into view once (`reveal`, from an effect on the message, never on a layout): the request's
  return, phone and sending errors with the field at fault, Profile's home airport, password and phone. Choosing an
  airport and opening the calendar put the keyboard away. The eleven sheets — the request, the dates, Explore's cabin
  and travelers, the notifications question, Profile's home airport, cabin, travelers, password, phone and
  notifications — move onto it with their test IDs. The cabin sheets draw Figma's two cabins one under the other
  (238:4710); the others keep their content, words and order (the request also its 12 pt between blocks): the
  screens' work follows.
- **The bugs** —
  1. Back to Round trip after One way, the return took the departure's date ("0 nights"), so the missing return could
     never be asked: the return now comes back without a date, and a one-way search's request invents none either; the
     sheet asks for one on sending (Figma 135:851). `legsForTripType`.
  2. Choosing an airport (onboarding; Profile's home airport) wrote `New York · JFK` into the field, which searched those
     words and reopened the list over the choice: the chosen airport's words are not searched (`wantsAirportSearch`),
     an answer still on its way when the member chooses is dropped, and the list never shows under a choice.
  3. A paused search (429) before the new destination's first answer left the sheet with neither fares nor the button
     `Request a quote`: a paused search always docks it (`wantsQuoteFooter`, 481:9097).
  4. The black band under the tab bar (above).
- **`DESIGN.md`** follows: the button loses the arrow (in the rules and the pressed state) outside the entry, which
  keeps it and `button-outlined`; `button-secondary`, `chip`, `airport-row`, `stepper`, `modal-sheet` and
  `close-button` join the components; the tab bar is white with no rule above and runs under the home indicator; its
  icons are 24 pt (it said 18). `design/components.md` and `design/agent-prompts.md` likewise.

**Not in this step.** The screens' own layout and words — onboarding, Explore, the fare, the request sheet's content,
Requests, Profile's pages and sheets, the system screens — follow screen by screen against the board. The entry is not
brought to Figma (the owner, 14 October): its layout, words, blur and logo stay as they are. The demo data Figma shows
(three fares to London, the four requests) is the shared fixture's (`packages/shared/src/fixture.ts`), which many
tests read: its own step. Figma draws the status badge transparent; it stays filled white (4.76:1 on the page,
ADR-IMPL-041, A2c).

**Consequences.** JavaScript only: an OTA reaches the 0.2.0 APK. Tests: `modal-sheet-sizes.test.ts` (Figma's heights,
headers, content tops, the actions' distance and how it gives way on a shorter phone, how far a reveal scrolls),
`airport-search-state.test.ts` (`wantsAirportSearch`), `build-draft.test.ts` (`legsForTripType`), `quote-footer.test.ts`
(`wantsQuoteFooter`). The e2e flows keep their test IDs; `scripts/check-maestro-ids.ts` also reads an id a screen hands
to the component that draws the control (`closeTestID` for a sheet's ×; `countryTestID` and `toggleTestID` with it).
The gallery (`/dev/gallery`) shows each component's Figma states.

## F2 — Onboarding as Figma draws it (14 Oct 2026)

**Context.** The onboarding was one form with the airport search inside it. Figma draws two steps on one screen: the
form (63:7) — the home airport, the cabin, who usually travels — and, from its airport field, the search (72:222). The
owner, 14 October: as Figma draws it, keeping what was built with it (the time zone's suggestion, A5).

**Decision.**

- **The form** (63:7): the 2-pt progress line 14 pt under the status bar, the content 16 pt under it;
  `Where do you usually fly from?` in `headline` and its line in `body-sm`; three groups 24 pt apart, each label in
  `caption` 8 pt over its control — `Home airport` (the field shows the chosen airport, `New York · JFK`; a tap opens
  the search), `Cabin` (two chips sharing the row, 16 pt apart), `Who usually travels` (the stepper, adults 1–9, and the
  line about children). `Continue` and the text button `Skip` pinned 8 pt apart, 40 pt above the frame's bottom (the
  home indicator's 34 and 6 more; never closer than 16 to the edge).
- **The search step** (72:222): `Where do you fly from?`, the field focused, the time zone's airport offered under it
  while nothing is typed (A5, 536:11191), the matches as airport rows 8 pt apart, `No airports found` with
  `Clear search` (75:269); `Cancel` pinned 48 pt above the bottom. Choosing an airport puts the keyboard away and goes
  back to the form; nothing is chosen for the member.
- `Continue` without an airport says so under the field, the field's border in `status-danger`; nothing is saved.

**Consequences.** JavaScript only. The registration flow keeps `onboarding.root` and `onboarding.skip`.
