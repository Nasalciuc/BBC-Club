# ADR-IMPL-046 — The shared components as Figma draws them

Status: accepted · Date: 2026-10-13 · Amended 2026-10-14 by the screens' sections at its end (F2 onward, then the review's fixes).

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

## F3 — Explore, the fare and the request as Figma draws them (14 Oct 2026)

**Context.** The frames of Explore (89:386–89:391, 104:838, 481:9097, 536:10635–536:11191), the fare (135:845–135:848,
135:859), the request sheet and the calendar (135:849–135:855, 167:2298, 325:5878–325:7161), the notifications question
(320:5704), the confirmations (135:856, 476:8871, 135:855) and the rate limit (481:9061), against the app on F1's
components. The skeletons matched; the measures, the words and several blocks did not.

**Decision.**

- **Explore.** The sheet rests at Figma's points exactly — 300 / 544 / 656 of the 768-pt container (`HOME_SHEET_SNAPS`
  as fractions of 768, no rounding); 12 pt above and under the 32 × 4 handle. A route's empty, offline and on-request
  states (89:390, 89:391, 536:11155) are a page, not a sheet: no handle, no drag, the field 4 pt lower. Labels sit in
  Figma's 32-pt box (`SectionLabel box`), `See all` an 80 × 48 text button; the fare count's box holds the paused
  search's message (481:9097). Rest: the label 12 pt under the field, the 120-pt carousel 12 under it, the cards 12
  apart inside the gutters, the second cut at the gutter. Expanded (89:389): `OFFERS TO INSPIRE` heads the page, then
  one carousel per region in the server's words — `To Europe`, `To Asia`, `To the Middle East`, `To North America` (the
  americas' US, CA and MX; Brazil has no section) — 32 pt apart. Typing (89:388): the labels' boxes and the 72-pt rows
  12 apart, `RECENT` under the matches without repeating one. The header's `Cancel` and `Done` are 80 × 48 with the word
  centred; the field's `Clear` is a 60 × 48 text button — the button's 17-pt while typing, the 15-pt on a chosen route.
  The estimate row has the fare row's 88 pt and its 32-pt tile carrying `≈`.
- **The fare row's facts** are the stops and the time in the air (`NONSTOP · 7H 05`, 89:387); the clocks are the fare
  page's (ADR-IMPL-019 is amended in part).
- **The fare** (135:845 / 135:846): a search fare's page opens on its route in `display`; an offer's has its 340-pt
  photo band. The airline, the two clocks under their airports and `OCT 12 · ONE WAY · 7H 05M` — the departure's day at
  the origin airport, never the phone's (ADR-IMPL-019). `Your fare` and the published fare side by side (the pair wraps
  rather than shrinking); `Why it's $X lower` is a 56-pt row that opens **About this fare** (135:847, the `explain`
  sheet): the two fares, the sum written out (`$7,850 published − $4,200 your fare = $3,650 difference.`), when the
  published fare was recorded, the specialist's promise, `Got it`. `Request this fare` and its line pinned 6 pt over the
  tab bar. `Call a specialist` is no longer on the fare's page — Figma has it on the request's and the system's.
- **A fare that closed** (135:848): `Flight details` beside the back button; what closed — its day, its route by its
  cities, its airline and cabin; the message; `Request an alternative` pinned 30 pt over the tab bar. **The server**
  sends what it needs: `GET /v1/fares/:id`'s 410 `error.context` adds `fromCity`, `toCity`, `carrier`, `cabin` and
  `departDate` (the origin airport's day) to the price, the validity and the route it sent; the app reads them only when
  present, so an older server still gives the route's codes.
- **The request sheet** (135:849–135:854): the fare's summary — `New York to London` (the codes when a city's name is
  not known), `JFK → LHR · British Airways · Business`, `$4,200 per traveler` — then the trip type, Depart and Return
  side by side (16 pt apart), the travelers' stepper, `WE WILL CONTACT YOU` with the name, **the phone in one field**
  (`+1 (212) 555-0148` as a person reads it; the country picker is gone — a number that starts with `+` carries its
  country, any other is read in the phone's), the e-mail, and `Add a note`; the blocks 24 pt apart; the button and its
  promise pinned. A number that does not parse says so under the field and offers `Use saved phone number` (135:852).
  While it sends (135:854, 491:8357) the sheet has no ×: the title rises 10 pt (`ModalSheet closable={false}`). A return
  that is missing (135:851) and a request saved offline (135:855) as Figma draws them. The labels are the field's
  (`TextField`: the label 8 pt over the white 56-pt field, no magnifier — that is the search field's).
- **The calendar** (325:5878, 325:6505, 325:7161): the chosen dates as words under the title, DEPART and RETURN side by
  side (one way: DEPART alone), the months scrolling under them, the button and its guidance pinned. `Use these dates`
  waits for a return on a round trip (167:2298 shows it enabled before one is chosen). Explore's
  `Keep the dates flexible` stays (the owner, 14 October).
- **The notifications question** (320:5704): the medium sheet under its headline; `Turn on notifications` and `Not now`
  (the 48-pt secondary button) 12 pt apart.
- **The confirmations**: an offer's over its city's photograph (135:856), a search's under the globe with its route
  (476:8871), the one saved on the phone (135:855); the facts on two lines; the promise names the number the request
  will be called on. The rate limit (481:9061) as Figma lays it out.
- **Inputs inside a sheet** go through `SheetTextInput`: gorhom's input on a phone, React Native's on the web, where
  gorhom's calls a `TextInput` API the web lacks. `TextField` and the search field use it.

**Where the app stays apart from Figma, with the owner's agreement:** `Clear` stays in the route's empty, offline and
request states, where Figma draws none — the way back to the search; Round trip and One way share the row; a field the
screen focuses shows the focus border; a request's day is its origin airport's.

**Consequences.** The app and two server changes, both read only when present: Home's sections (the mobile BFF) and the
closed fare's context (the catalog). No migration. Tests: `fare-page-logic.test.ts`, `request-summary.test.ts`,
`fare-gone.test.ts`, `confirmation-logic.test.ts` (`factsLines`), `home-sheet-snaps.test.ts`, `fare-facts.test.ts`, and
the API's catalog suite (the regions' titles; the 410's context).

## F4 — Requests, Profile and the system screens as Figma draws them (14 Oct 2026)

**Context.** The frames of Requests (233:4069, 233:4139, 233:4639, 240:5199), a request's detail (233:4171, 233:4248,
233:4671, 233:4388, 325:8136, 325:8229, 325:8295), Profile (233:4453, 233:4550), Settings and Edit profile (479:8226,
479:8296), Profile's sheets (238:4561–238:5260, 320:5810, 320:5969, 325:8392, 325:8525, 325:8648) and the system screens
(240:5093, 240:5129, 240:5163). The owner, 14 October: a request shows its fare only when the quote is ready, the
published fare struck beside it with its source, as Figma draws it; the fare stays navy; the app follows 325:8136 for a
specialist's review; the four things the app has and Figma does not stay (below).

**Decision.**

- **Requests** (233:4069): the title and its line scroll with the list, 8 pt under the safe area; `No requests yet.` 24
  pt under the line (233:4139). A request the server holds but has not referenced yet reads **Just received** (233:4639
  / 233:4671): `We have your request. A specialist will call shortly.`, the number it will be called on.
- **A request's detail**: the fare only at **Quote ready** (233:4171) — `YOUR FARE` over the price and, when the server
  recorded them as the member asked, the published fare struck beside it with its source (FTC: a struck price always
  carries its source) — in navy, as the rest of the page. The badge under the title keeps Figma's widths (88 pt, 104 for
  Quote ready; Not sent hugs its words). The facts on two lines. `REF` closes the page, under everything.
- **The published fare on a request (server).** `requests.requests` gains `published_at_request` and
  `published_source_at_request` (migration 0029: both or neither, the amount above 0, the source not blank — expand
  only). When a fare request is made, the server reads the fare's published price and source from the catalog **once**,
  within a second, and records them only if the fare is still the price the member saw (cents equal) and in USD;
  anything else — a quote, a missing fare, a timeout, an error — records nothing, counts
  `bbc_request_published_unavailable{reason}` and never refuses the request (as ADR-IMPL-042's estimate). A later change
  to the fare never changes a request. `RequestVM.publishedAtRequest` is `{ amount, source } | null` (absent and
  unreadable read as null). What the app sends is never trusted for it. The staging demo links R-B002 (Paris) to Air
  France's fare, so the quote ready shows its pair.
- **Profile** (233:4453): the header 44 pt, 8 pt under the safe area, the gear centred in its 44-pt target at the
  gutter; the home airport's pill 144 × 36, its words centred; under the phone, `Client since 2019` in `caption` — a new
  client's e-mail in `body-sm` (233:4550) — both `text-secondary`, 8 pt under the row.
- **Settings** (479:8226) and **Edit profile** (479:8296): the back button stays at the safe area, the page scrolls 20
  pt under it and stops 16 pt above the tab bar, which both now show (Profile active). `Settings.` with its full stop;
  no section labels. Phone, Password and Notifications in 64-pt cards 8 apart, the phone as a person reads it;
  `Request updates are always on.`; `Delete account` as a red row with its chevron; Privacy policy, Terms of use and
  Help as 56-pt rows with `↗` (`ListRow trailing="external"`, a link to a screen reader) — each only when its address is
  set; `Sign out`; every block 24 pt apart. Edit profile: three 56-pt rows 24 apart, `JFK · New York` (the city from the
  airport search).
- **Profile's sheets.** Home airport (238:4561): `The airport you usually fly from.`, the field empty
  (`City or airport`), the airport now (`JFK · New York`) under it, and under that the airport of the phone's time zone
  to choose (A5) where Figma draws four fixed ones; choosing one empties the field and names it. Preferred cabin
  (238:4710) and Travelers (238:4842) say what they set. Change password (238:4974): `Current password`, `New password`,
  `Confirm new password` in `body-sm`, `Enter password` and the eye in each field (`PasswordField`), hidden until the
  eye shows it. Notifications (238:5384): `Choose what reaches you…`, `Request updates` locked on (its label and switch
  at 40 % on the white card — `ListRow toggle.locked`), `Offers to inspire` with its note, the phone's note, `Done`.
  When the phone has turned the app's notifications off (325:8648):
  `Notifications are off for BuyBusinessClass in iOS Settings.` (device settings on Android), `Open Settings`, both rows
  off and dimmed; back from the phone's settings the sheet reads the permission again. **Delete account** is a sheet now
  (320:5810, `medium`): `Delete your account?`, the consequences, `Password` with the eye, `Delete account` and the
  48-pt `Cancel`; a wrong password marks the field and says so 8 pt under it (325:8392); any other failure says so in
  the sheet, which stays open.
- **The system screens** (`SystemScreen`): the wordmark at the safe area, the message 48 pt under it,
  `Call a specialist` — a secondary button — 12 pt under the message's action when the club's number is set.
  `Something didn't load.` (240:5093; Requests' first load that fails), `A new version is ready.` with `Update app` and
  no way past it (240:5129), `We'll be back shortly.` with `Try again` (240:5163). The maintenance message is the
  server's string — a moment (`2026-10-14T06:00:00Z`) becomes `Please check back at 2:00 AM your time.` in the member's
  own time (the day too when it is not today); other words show as written; anything but a non-blank string is no
  maintenance at all. No version line.

**Where the app stays apart from Figma, with the owner's agreement:** `This closes N open requests.` in the deletion's
words, a request's `REF`, the not-sent request's own words and Explore's `Keep the dates flexible` (all four kept, 14
October); the unread dot on Requests; one airport offered by the time zone instead of Figma's four; the maintenance
page's `Call a specialist` 12 pt under `Try again` (Figma leaves an empty 48-pt place between them); no magnifier in a
field that does not search (Figma's password fields carry one).

**Consequences.** The app (an OTA) and the server: migration 0029 runs before the new API starts (expand only — the old
API ignores the columns). Tests: `migrate.test.ts` (0029's constraint), `published.test.ts` (when a published fare is
recorded), the API's `requests-published.test.ts` (recorded once, from the server; the app's never trusted; a quote, a
missing price and a different price record nothing; a later fare change leaves the request as it was),
`staging-demo.test.ts`, `request-view-logic.test.ts` (Just received; the fare only at Quote ready),
`airport-search-state.test.ts` (`homeAirportLabel`), `app-gate-logic.test.ts` (the maintenance), `error-context.test.ts`
(Figma's words).

## The screens' review (14 Oct 2026)

**Context.** CodeRabbit's review of the screens' PR left thirteen comments. Eleven are taken; two are where the app
follows Figma against `DESIGN.md`'s older sentence, and `DESIGN.md` now says what Figma draws.

**Decisions.**

- **The departure's day comes from the server.** `FareVM` grows `departDate` (`YYYY-MM-DD`, nullable, optional for an
  older server's answer): the catalog names the day in the origin airport's zone, where it already names the clocks
  (amends ADR-IMPL-019's point 2). The app prints it as it is; only without it does it read the day back from the
  instant and the wall clock, which cannot tell UTC+13 from UTC−11 (Auckland's summer: 01:30 on the 13th is 12:30 UTC on
  the 12th).
- **A connecting fare counts no stops.** The catalog knows `nonstop` or not, never how many stops: `CONNECTING · 18H 20`
  on the row, `British Airways · First · Connecting` on the page — not `1 STOP`, which asserted a count nobody has.
- **The comparison's sum is true to the prices as printed.** `savings` is the difference of the two prices each rounded
  to the unit, as `formatPrice` prints them: `$5,000 − $1,001 = $3,999`, never `= $4,000`. The sheet's title and the
  written sum share it.
- **Migration 0029's CHECK is added `NOT VALID` and validated in its own transaction**: the table's lock is held for a
  moment with no scan under it; the scan that validates the rows runs next, under a lock writes do not wait for. The
  end state is the same (`convalidated`, tested).
- **Home's ETag holds each carousel's membership**: an airport's region or country corrected moves an offer between
  the regions with the same offers in the same states, and the app is not left on its 304.
- **No offers at all is a state, not a heading over nothing**: `No offers yet.` with `Search a destination`, on the
  sheet at rest and expanded (Figma draws neither page without cards; `explore.offers.empty`).
- **`See all`'s 48-pt target lies inside its row**: the row grows to the 48 and gives the 8 pt back above and below —
  a touch never reaches a child outside its parent's bounds, so the negative margins on the button alone left a 32-pt
  target. The box keeps its 32 pt in the rhythm.
- **`Try again` on an airport search runs the search effect once more** (onboarding, the home airport sheet): its
  answer is dropped like any other when the member has typed on, chosen or cancelled by the time it comes.
- **Onboarding's `Continue` without an airport says `Choose your home airport to continue.`** — the field only opens
  the search; the old words asked for a code nobody can type there.
- **The home airport sheet saves the airport chosen, else the member's own.** Words still in the field were never
  chosen: a whole code the catalog knows (typed `LHR`, no row tapped) is taken as the choice; a city or a fragment asks
  to `Choose an airport from the list.` and never saves over the chosen airport unseen.
- **Signing out that fails brings the button back** and says so on the page, instead of `Signing out…` for good.

**Kept as Figma draws them.** The offer's photograph on the fare page sits under a flat `surface-night` veil at 32%
(436:1220, as the profile hero's 436:1221), not `DESIGN.md`'s bottom gradient, which is the entry's cabin photograph's;
`DESIGN.md` now says so. The paused search's line in the fare count's box is `caption` (481:9097).

**Consequences.** `FareVM` changes (expand only: a field the app reads when present); the catalog's clocks test prints
the day; `migrate.test.ts` checks the constraint is validated; `catalog.test.ts` checks the ETag moves with a region.
