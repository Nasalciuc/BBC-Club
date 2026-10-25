# BBC Club 3.0 — Components (anatomy, states, rules)

Companion to `DESIGN.md` (ADR-IMPL-055, as drawn since ADR-IMPL-056). Token refs are canonical; this file adds what an
agent would otherwise guess. The references are the component sheets in `isolated/bbc-club-3.0-design/final/components/`
(37–44) and the screens beside them. The entry's components (`ClubButton`, `ClubField`, `ClubIcon`) stay 1.0 and read
only `club.ts`.

Numbers are points, measured from the images (ADR-IMPL-056). A component drawn differently on different screens has a
`look` per screen, named for it, holding that screen's values; where two images draw the same element differently, the
screen it appears on most wins and a state follows its screen (`DESIGN.md`). The 1.0 defaults (52-pt pills, 56-pt rows,
24-pt sheet corners) remain for the few places no image draws (the gallery, the error pages, the 1.0 sheets).

## Buttons (sheet 38)

- **Button · primary** — a navy pill (`action-primary`), its words white and centred, in the role and at the height each
  screen draws: 44 by default; 01 `Continue →` 45 (radius 19, `buttonOnboard`); 02/13 `Request a quote` 40.6; 04 36.6;
  05 39.3; 06 29; 07 `Use these dates →` 32.8; 08 `View request ›` 34.36; 10 53.8 (`buttonLg`); 11 40.2; 12 33.9; 17
  43.4; 20 39.2; 21 41.5; 25 44.25; 26 42.93; 27 42.75. An icon before the words (`Call your specialist`,
  `Edit profile`) or an arrow or chevron after them (`trailingIcon`; `trailingInset` puts it at the pill's right edge),
  each at the size and gap the screen draws (`iconSize`, `iconGap`, `labelOffset`, `trailingOffset`). Pressed:
  `action-pressed`. Disabled: as the screen draws it (24: `pill-disabled` with `text-pill-disabled` words); light tint
  with slate words elsewhere. Sending: a small white spinner before the words the screen passes (`Sending…`), taps
  blocked. One per screen.
- **outline** — white on a 1-pt `border-default` ring: 12's `Call us` 33.9 with the card shadow; 15's `Clear search`
  33.2 in `buttonClear`, on a `text-muted` ring. **destructive** — the red outline (1.5 by default): `Sign out` on 12 at
  29.3 with a 0.6 ring (`profileSignout`), on 34 at 36 with 0.6 (`settingsSignout`). **destructive-filled** — red, only
  inside the deletion sheet (`Delete account`, 35).
- **TextButton** — the words alone, reaching 44 pt to the finger: `primary` navy (`Cancel` on 35, `Done`), `link` the
  deeper blue Search draws (`text-link`: `Cancel`, `Clear all` on 03/18), `secondary` slate (`Not now`), `muted`
  (`text-muted`, 01's `Skip`). 08's and 12's `See all ›` are their own Pressables (`text-subtle` with `receivedSeeAll`;
  `text-on-tint` with `profileLink`).
- **RoundButton / BackButton** — a circle at the diameter its screen draws, reaching 44 pt: 05 back, share and heart
  33.7; 13 back 36 and bookmark 35.5; 11 back 35; 12 settings 35; 26 back 35.3; 07's profile button 25.4. Tones:
  `photo`, white with the float shadow over a photograph (05, 13); `glass`, `photo-button` without a shadow (11's back,
  12's settings); `neutral` (`surface-neutral`, 07); BackButton `round` (`surface-round`, 26); the back chevron alone in
  a top bar.

## Fields and controls (sheet 39)

- **SearchField** — `bar` on Explore (02): white, 53.7 tall, radius 19, the card shadow; the magnifier's 24-pt box 17.6
  in at a 1.8 line, in navy; the words 55.6 in, in `searchBar` slate; it opens Search. While searching, a look per
  screen: `search` (03, 18) — light tint, 36.5 tall, radius 10.5, the magnifier 19.5 at 2 in slate, the words in
  `field`; once filled, the clear button (16 across, its × 10 at 2.4, 12 from the edge); `Cancel` 16.1 after the field
  (`text-link`). `onboarding` (14, 15) — 43.8 tall, radius 12, on `surface-notice` without a hairline; the magnifier
  22.5 at 1.6; the words in `onboardInput`; the clear button 18.5 in `text-muted`; `Cancel` navy (`onboardCancel`), 11.1
  after.
- **TextField** — white on a hairline; the icon in its column, a rule, the label over the words. The look of 06, 22 and
  23 (`request`): 36.8 tall, radius 5; the icon 14.5 at 1.5, centred 16.9 in; the rule at 33.2; the label in
  `fieldLabel` (`text-label`) 40.33 in on 15.5, the words in `fieldValue` on 30.4, a placeholder in `fieldPlaceholder`
  (`fill-muted`) on 28.56. Focus: a 0.9 navy border. Error: a 0.7 red border and red label; the line under it
  (`FieldError`, in `fieldError`) 11.4 under the field. Not editable: light tint, no border. 35's (`delete`): 45.6 tall,
  radius 7.5, the filled lock 21.5 centred 23.76 in, `Password` alone in it as its placeholder (`deleteField`,
  `text-field-label`) 50.7 in on 27.94 — no eye (35 draws none). The default (60 tall, radius 10, a 24-pt column) serves
  the 1.0 sheets.
- **PickerField** — the same frame opening a picker, a chevron down at its right (`Depart`, `Return`, `Travelers`). The
  `request` look: 37.4 tall, radius 5; the icon 14.5 centred 17.3 in; the label 39 in on 15.48, the value on 30.05; the
  chevron 11 at 2.04, centred 15.7 from the right. A missing value shows its placeholder in slate. Error (22): the icon,
  the label and the chevron red on a 0.7 red border. Sending (23): light tint, no border.
- **Segmented** — `Round trip` / `One way` (06): two segments 24.8 tall, 9.5 apart, radius 4.5; the chosen navy with
  white `segmentOn`, the other `segmentOff` navy on a hairline; on 23 the other is light tint with `text-label` words.
- **Stepper** — 01: a white card 63.1 tall, radius 10, on a hairline with the soft shadow; the adult glyph 24.4; the
  label over its caption 58.3 in (`travelerTitle` / `travelerSub`: `Adults` / `Ages 18+`); the pill 104 × 33.2 in three
  parts — `−` 32.8 and `+` 33 on `surface-tint-soft`, the count 38.2 on white (`stepperValue`), the signs 17 in
  `text-on-tint`; a bound dims its button to 40%. The default card (radius 11, at least 72) serves the profile's and the
  request's travelers sheets.
- **Toggle** — 40.6 × 24 (07): navy on with the white knob (21 across, its own small shadow) at the right, light grey
  off (`toggle-off`); the target reaches 44 pt (`TOGGLE_SLOP`), and a holder that hugs the track keeps that room.
- **Calendar** (07, 24) — two months at a time, each a white card (radius 10, a soft shadow on a hairline), 6.4 apart:
  its name (`month-title`) and the arrows at its right that move both cards by a month (from this month to the last that
  can be booked, 330 days out; dimmed where they cannot go); `Mon … Sun` (`weekday`); the days 29.1 tall, 2.47 apart
  across and 1.92 down, in neutral squares (radius 4.8); the departure and the return navy circles (29.7) joined by a
  light blue band (`day-band`) through the days between, rounded where a week starts or ends; days that cannot be chosen
  keep their square with a slate number. Weeks start on Monday as the images draw them (`WEEK_START`; 1.0 started on
  Sunday).
- **Chip** — a light tint pill, an icon and navy words, at the size each screen draws: `trip` 31 (`chipTrip`); `route`
  31.3 on 13 (`routeChip`); `place` 30 on 04 (`placeChip`); `fare` 26.8 on 05 (`fareChip`, not pressable). `filter`, the
  status filters (09): 31.7 tall, at least 55.5 wide, 14 from either side, `chip` words in `text-on-tint`; chosen, navy
  with white `chipSelected` words; the row starts 12.2 in, the chips 5 apart, running to the screen's edge. A chip that
  acts reaches 44 pt to the finger (`CHIP_SLOP`); a row that scrolls keeps that room in its padding, its margins giving
  it back (04, 09, 13), since a touch lands only inside the row.
- **CabinCard** — two side by side (01): 72.8 tall, radius 10.5, the soft shadow; the seat (33.2, traced), the cabin in
  `cabinTitle`, its line in `cabinLine` slate, broken where 01 breaks it; a check circle (22.6 in a 23.5 ring). Chosen:
  a 1.1 navy border on `surface-selected` and a filled navy check.

## Cards and rows (sheet 40)

- **InfoCard** — the icon, a title, the words, as each screen draws it: `family` (01) 59.5 tall, radius 10.75, on
  `surface-tint-soft`, `familyTitle` over `familyBody` in slate; `detail` (11, 30–33) radius 9.5, the icon in a 35.5
  `notice-circle`, `noticeTitle` over `noticeBody`, at least 72 (62.4 with a title alone); `attention` (28) radius 9 on
  `surface-notice`, the bare info mark 27 at 1.96, `noticeTitleSm` over `noticeBodySm`. The default (radius 11, the icon
  in a `border-default` circle, a `Try again` link or a chevron when the whole card acts) serves the 1.0 pages.
- **OfferCard** — white, the card shadow: the city's photograph across the top, the city, its country, `from` and the
  price, the `Save 54%` bar across the foot. `rest` (02): 121.3 × 265, radius 12, the photo 144.7; `offerCity` on 166.8,
  `offerCountry` on 182.8, `offerFrom` on 200.6, `offerPrice` on 218.4, the rating (`★ 4.8`, `offerRating`) where the
  sender gave one; the bar from 229.3 to 256.1 in `offerSave` on `surface-save-soft` — the whole card above the tab bar
  at rest. `sheet` (16): 121.4 × 222.4, radius 10.5, the photo 124.1, the `offerSm*` roles, the pill 22.1.
  **OfferCardWide**: the same laid sideways, two to a row (`To Europe`) or one across it (`To Asia`). **CarouselRow**
  runs to the screen's edges.
- **PopularCard** (03) — a destination as a white card, radius 10, on a hairline with the card shadow: the city's
  photograph across the top (118; Paris 118.2 and Tokyo 113.4 as 03 draws them), then the city in `subtitle` (its
  baseline 18.7 under the photograph, 13.4 in) over `Heathrow Airport · LHR` in `cardMeta` slate 16.6 lower, `from` over
  the price (`price-sm`) ending 34 from the right, a chevron.
- **RecentRow** (03) — a recent search: a white row 47 tall, radius 9; a small photograph (47.4 × 42, radius 6); the
  city in `rowTitle` over the dates searched (or the airport) in slate; a chevron; 5 apart.
- **FlightCard** (13, 04) — a flight option, white on a hairline with a soft shadow; its price says what it buys
  (`round trip`, `one way`). `detailed` for a fare on its own (13): 360.6 × 110.5, radius 10 — the airline and the
  cabin, then both airports with their times and days and the plane's line between, the price at the right. `compact`
  for one of several (04): 370 × 61.4, radius 12.5 — the airline centred at 54.6, 27.6, the times over the codes and
  `Nonstop · 7h 10m`, the price at the right. The airline is its mark: British Airways, Virgin Atlantic and American as
  04 draws them; fifty more from the package's logos (#76, `airlines/logos`, in British Airways' box, their own
  colours); else the fare's logo; else its name.
- **AirportRow** — a white card with the map pin: the city over `Heathrow Airport · LHR` and a chevron (Search), or the
  city and its code in slate at the right (onboarding); `selected` and `recent` as 14 and 18 draw them.
- **FareSummaryCard** (05, `Your fare`) — 364.4 × 73.3, radius 10, on `surface-neutral` without a shadow: `Your fare`
  over the price in `fareAmount`; `Down from $7,550 · Sabre · 16 Sep` on one line in `fareDown` where the published fare
  is on record (a reference price always carries its source); `Save 48%` at the right (22.6 tall, `fareSave` on
  `surface-tint-blue`). The trip chip above says what the price covers (`Round trip`, from the catalogue). The weather
  beside it (the mark 34.1, `fareSmall`, `fareTemp`, `fareWeather`, a `rule-line` rule at 178.2) shows only where the
  weather service answers for the trip (ADR-IMPL-056 §5); there is none yet.
- **FareOverviewCard** (05, `Flight overview`) — 363.9 × 89.8, radius 10, the soft shadow on a hairline:
  `Flight overview` (`fareCardTitle`) across the top; the airline — British Airways' ribbon over its name
  (`fareAirline`), the name alone for the others — beside both airports, each its code (`fareCode`), its city, its clock
  (`farePlus` `+1` 3.8 after it) and its day; between them two `rule-line` hairlines and the navy plane (20.3).
- **FareRouteCard** (05, `The route`) — 363.9 × 121.1, radius 9: the title over the map (85.4 tall, radius 8.5): the
  land in `map-land` on `map-ocean` (the globe's land data, no tiles), the great circle dashed in navy (3.2 on, 2.9 off,
  at 1) and bowing up, the plane (16.5) at its middle, a navy dot (6.5) at each airport with its code (`mapCode`) over
  its city (`mapCity`) beside it. `YourFareCard`, `FlightOverview` and `RouteCard` are the gallery's 1.0 cards.
- **QuoteFareCard** (11) — the quote on a request: `Your fare` over the price, the published fare struck through with
  `Save 48%` on `surface-save` (21.2 tall) and its source after it.
- **TripSummaryCard** (06; sheet 40 · 02) — the request sheet's trip: 359.5 × 90.06, radius 8.6, the soft shadow; the
  city's photograph (79.9 × 72.05, radius 5.5); the route by its cities over the cabin; at the right the design's mark
  (0.833 of its size, at most 24 tall), else the fare's logo, else the airline's name after the cabin; under a rule, the
  days as the sheet holds them and the flight's clocks, then the price (`summaryPrice`), the published fare struck
  through (`summaryPublished`) with `Save 48%` in words (`summarySave`, `text-link`) and its source (`summarySource`). A
  quote shows the route in its codes and no price.
- **TripCard** (08) — the request just received: white, radius 9, on a hairline over the soft shadow; the request's
  photograph (123.3 × 86.8, radius 8.2) at the left; `BUSINESS CLASS` over the codes with the arrow between them, the
  days, then the trip and the travelers with a dot between; at the right the airline — British Airways' ribbon over its
  name in capitals, a word to a line; else its mark (no wider than the column's 64), its logo or its name.
- **OfferCard · compact** (08, `Other great fares`) — 114.2 × 117.2, radius 8.1, on a hairline over a light shadow: the
  city's photograph across the top (77.6), the city over `from` and its price; three to the width, 8.55 apart. 08 draws
  the price without `from`; a starting fare says so.
- **RequestCard** (09, 28; sheet 40 · 09) — a request on Requests: white, radius 12, the card shadow, 140.9 tall, 9.5
  apart and 10.8 from the screen's edges; the destination's photograph (134.6 wide, 7.4 in, 4.7 from the top and 6 from
  the bottom, radius 8.5) at the left; the city in `requestCity` (baseline 36.6) with its badge at the right (a long
  city, or larger text, sends the badge to the next line); the route (`requestRoute`, 61.4) over the days
  (`requestDates`, 83.1), the chevron (24 at 1.2) beside them; a rule at 98.3; then the trip and the travelers in `fact`
  slate (121.4), each with its icon. A request waiting on the phone says `Your travel details are saved` on a line of
  its own between two rules (28: its baseline 16.8 under the first, the second 10.4 under that, the facts 19.6 lower)
  and keeps its year; 28 draws its whole list shorter than 09, and the cards keep 09's measure. The whole card opens the
  request; its calls and retries live there. The days come as the server writes them, without a year (`Nov 12 – 19`).
- **TripPhotoCard** (12, `My trips`; sheet 40 · 12) — the city's photograph, 89.4 wide and at least 135 tall, radius 8,
  darkened from 42% down (`photo-veil`): the city in `tripCity` over the days (`tripDates`) and the route (`tripRoute`),
  all white. The city keeps one line; larger text makes the card taller, never cut.
- **ProfileHero** (12) — the home city's photograph from edge to edge under the status bar (95.3 below the safe area),
  the member's portrait (`Avatar`, 113.6 in a 3.8 white ring) over its foot, 75.8 of it on the photograph; the name in
  `profileName` and `Flies from JFK` in `profileHome` (`text-on-tint`) under it, centred; the glass settings button (35
  across) over the photograph at the right.
- **ListRow / RowGroup** — rows in one white card: the icon in its column, the label, the value, the chevron; a
  `border-faint` rule between rows from where the words start, laid over the rows so it never moves them. Looks:
  `profile` (12) radius 10, rows 29.65 (31.2; `Delete account` 33.4), the icon 16.5, `profileRow` / `profileValue` in
  `text-on-tint`; `settings` (34) radius 9, rows 47.1 (34 draws Phone 45.4, Password 48, Privacy policy 46.6, Terms of
  use 48.4 and `Delete account` 46.8 — the screen passes each), the icon 19.4, `settingsRow` / `settingsValue` navy;
  `edit` (36) radius 11, rows 48.2, the icon 21, `text-on-tint`; `fare` (05) radius 9, rows 37, `fareRow`, `rule-line`
  rules, a hairline and the soft shadow, the value in slate. Beside a value the label keeps its own line; a value too
  long for what is left (a member's own name, a long city at 1.3× text) wraps, `xs` clear of the label, and its row
  grows — neither is cut. `danger`: the trash and the words in red. `stacked` (the label small over the value) and the
  56-pt rows are 1.0's.
- **StatusBadge** (sheet 41) — `Quote ready` navy fill (`badgeStrong`), `Received` light blue, `Booked` navy outline
  with a check, `Closed` on `surface-closed` with `text-on-closed` words, `Not sent` on a 0.9 `border-strong` ring; the
  others' words in `badge`; 25 tall (26.7 beside a title, in `badgeTitle`; 23 small).
- **Save** — `Save 48%` only where the published fare is on record, in the tint each card draws it with:
  `surface-save-soft` across an offer's foot, `surface-tint-blue` on 05's fare, `surface-save` on a quote, words alone
  on 06's trip. `SavePill` (`border-default`, 28 tall) is the gallery's.

## Feedback (sheet 41)

- **EmptyState** — centred: an illustration or an icon, the title, the words in slate, then the pill. Looks: `requests`
  (10) `emptyTitle` / `emptyBody`, the pill 53.8 (`buttonLg`) — its picture (the seat, the window over London, the globe
  and the boarding pass) is the package's `empty-state-illustration.png`
  (`apps/mobile/assets/images/club/illustrations/requests-empty.webp`); `explore` (17) `exploreEmptyTitle` and its
  words, the pill 43.4 hugging its words; `search` (15) the magnifier 36 at 1.3, `emptyTitleSm` and its words, the
  outline `Clear search` 33.2.
- **Pages that are a message** — each drawn on its own screen: 21 `This fare is unavailable.` (`goneTitle`, no words,
  the pill 41.5, `app/fare/[id].tsx`); 26 `Saved. It goes out when you're back online.` (`savedTitle` / `savedBody`, the
  round back 35.3, `Done` 42.93, `app/request/confirmed.tsx`); 27 `You've sent several requests this hour.`
  (`app/request/limited.tsx`). **StateMessage** (the title in `headline`, the words in `body-lg`, a 44-pt pill) serves
  the error pages.
- **NoticeCard** — a message inside a page: `error` light red with the red mark; `offline` light tint with the phone in
  a circle; `attention` light tint with the info mark; the words in `text-on-tint`; an underlined `Try again`. Over a
  list (28) the attention card is the compact `InfoCard` with the bare info mark.
- **Timeline** (11, 30–33; sheet 41, the horizontal stepper) — `Received → Quote ready → Booked`: a step reached is a
  21.4 navy disc with a white check (14.8); the step the request is at, a 16.6 navy dot, a 2.2 white gap and a 3.2 ring
  in `step-ring` (27.5 across); a step to come, a 21.7 white disc in a 1.6 `border-strong` ring. Names in `step`, a step
  to come's in `stepTodo` slate, the day under a reached step in `stepDate`. The line between two steps is navy (1.9)
  once the second is reached, else `step-line` (2.2). Each step is centred over its words; the line runs from circle to
  circle. A request not sent has reached none; a closed one keeps the steps it reached and is at none (its badge and its
  message say it is closed).
- **Skeleton / CardSkeleton** — blocks in `skeleton` that shimmer (opacity only; still under reduced motion); in a
  `CardSkeleton` (29) only the photograph's block shimmers.
- **CheckCircle** — the navy disc (58.3) in a white ring (67.6 across), no shadow, the check traced from 08 (a request
  received).

## Navigation and surfaces (sheet 42)

- **TabBar** — Explore (compass), Requests (clipboard), Profile (person), as 09 draws them (the bar 45.4 above the home
  indicator, white under a hairline, to the screen's edge): the icons 24 centred 20.5 under the hairline, the words'
  baseline 45.2 under it; the active tab its traced filled glyph and `tabActive` navy words, the others slate line icons
  (1.4) and `tab` words; a 6.5-pt navy dot on Requests while a quote is ready. The other images set its words anywhere
  from 22 to 44 pt above the screen's foot; one bar for every screen (09's) keeps it still from screen to screen.
- **TopBar** — the back chevron and the wordmark centred with an action at the right (07, `dates`), or the page's title
  beside the chevron: 34 `settingsTitle` (the chevron 30.6, the bar 52.2), 36 `editTitle` (26.8, 54.3).
- **ModalSheet** — the page dimmed by `scrim`; a white sheet with the sheet shadow, its grabber, the title at the left
  and the plain × at the right; a question with its own answers hides the × (`showClose={false}`); actions pinned at the
  foot. Looks: `about` (20) 335 tall, corners 17.5, the grabber 36.4 × 4.5 (`grabber-about`), the × 17.9 in a 30.8 tint
  circle, `aboutTitle`; `request` (06, 22, 23) 585.96 tall, corners 17.7, the grabber 34.6 × 4.1, the plain × 19.4 at
  1.14, `requestTitle`; `question` and `delete` below. The 1.0 sizes (tall, explain, medium, short; corners 24, the
  grabber 40 × 5) serve the profile's sheets.
- **PageModal** (07) — a whole page over the screen and its sheets: it rises like a sheet, covers the screen to its
  edges, has no grabber and no drag; its back button and Android's Back close it. The dates page is one: it opens over
  the request sheet as over Explore. Its top bar is the back chevron with the wordmark centred and 07's profile button
  at the right, which closes the page and the sheets under it before it opens Profile.
- **ModalSheet · question** (25) — a short question: 228.08 tall, corners 16.75, the grabber 37.32 × 3.68; its mark (the
  bell, traced from 25) centred over the centred title (`questionTitle`), no ×, the pill (44.25) and the slate `Not now`
  under it; the page dimmed darker (`scrim-question`); taller by a title that wraps or a taller home indicator.
- **ModalSheet · delete** (35) — the deletion: 353.38 tall, corners 19.75, the grabber 37.32 × 4.15 (`grabber-delete`);
  the title (`deleteTitle`) at the left, the words in slate (what closes with the account on a line of its own), the
  password field with the filled lock — `Password` alone in it, no eye (35 draws none) — the red pill (36.86) and
  `Cancel` (navy, as text buttons are; 35 draws it slate); the page dimmed darker still (`scrim-delete`). The pill keeps
  the club's red: 35's lighter one leaves its white words at 3.6:1.
- **HomeSheet** — Explore's sheet over the globe at three stops the screen sets (02, 13, 16). At rest it is no card: the
  search bar floats on the globe's foot and the offers sit on the page, the sky fading into it; raised, it is the white
  sheet with the sheet shadow — on a chosen route (13) with 26-pt corners and the grabber 41.5 × 4.4, over every offer
  (16) with 22-pt corners and the grabber 48.4 × 4.2; the docked `Request a quote` 40.6 tall.
- **Globe** (02, 13) — the Earth by day on the pale sky: Mapbox's satellite imagery where the build has it, else the
  drawn globe in the `globe-*` colours. Destinations are navy drop pins (18 × 25, the tip on the place) with a white
  label beside the head — the city over its price (`pin`, `pin-detail`) — placed right of the pin or else left, and left
  out where it would cover another label, a pin or a button; a chosen route shows only its two ends with their codes, a
  white line arcing between them and the plane at its middle.
- **Wordmark** — `BuyBusinessClass` Semibold and ` Club` Regular, one line, navy — over 08's daylight photograph too
  (white only over a dark one); 07 sets `BuyBusinessClass` Bold (`wordmarkDates`).
- **Avatar** — the member's portrait in a white ring; their initials on navy until the club keeps a photo.
- **Also in the library** — `SectionHeader` (a section's title with its action: 02, 03, 18), `CloseButton`,
  `ProgressLine` (01, 4.4 tall), `PhotoThumbs` and `PageDots` (05's photographs), `PhotoCredit`, `GlobePin` and
  `RouteEnd`, `PricePair` (20's comparison); the app's own `HomeAirportCard` (01), `GreetingHeader` (02), `FareHero`
  (05, 21), `DestinationDetails` (04, 13) and the request page's call card (11: 51.6 tall, radius 11.5).
