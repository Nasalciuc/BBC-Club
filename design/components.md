# BBC Club 3.0 — Components (anatomy, states, rules)

Companion to `DESIGN.md` (ADR-IMPL-055). Token refs are canonical; this file adds what an agent would otherwise guess.
The references are the component sheets in `isolated/bbc-club-3.0-design/final/components/` (37–44) and the screens
beside them. The entry's components (`ClubButton`, `ClubField`, `ClubIcon`) stay 1.0 and read only `club.ts`.

## Buttons (sheet 38)

- **Button · primary** — navy pill, 52 pt, `button` words in white, centred. Optional icon before the words
  (`Call your specialist`, `Edit profile`) or a trailing arrow / chevron after them (`Continue →`, `Request a quote ›`;
  `trailingAtEdge` puts it at the pill's right edge: `Use these dates →`, `View request ›`). Pressed: `action-pressed`.
  Disabled: light tint, slate words. Sending: a small white spinner before the words the screen passes (`Sending…`),
  taps blocked. One per screen.
- **outline** — white on a light navy hairline (`Call us`, `Clear search` at 44 pt); **destructive** — the red outline
  (`Sign out`); **destructive-filled** — red, only inside the deletion sheet (`Delete account`).
- **TextButton** — the words alone in a 44-pt target: navy (`Cancel`, `Clear all`, `See all ›`, `Done`) or slate
  (`Skip`, `Not now`).
- **RoundButton / BackButton** — a 44-pt white circle with the float shadow over a photograph (back, share, heart,
  bookmark, close, settings); light tint on a white page; the back chevron alone in a top bar.

## Fields and controls (sheet 39)

- **SearchField** — `bar` on Explore: white, 56 pt, radius 24, the card shadow, the magnifier in navy, the words in
  `body-lg` slate; it opens Search. `field` while searching: light tint, radius 16, the magnifier in slate; once
  filled, the clear button (a slate circle with a white ×); `Cancel` beside the field.
- **TextField** — white, radius 12, a light navy hairline, 60 pt: the icon in a 24-pt column, a rule, the label in
  `body-sm` slate over the words in `body`. Focus: a navy border. Error: a red border and red label; the line under it
  (`FieldError`) red. Not editable: light tint.
- **PickerField** — the same frame opening a picker: icon, rule, label over value, a chevron down (`Depart`, `Return`,
  `Travelers`). A missing value shows its placeholder in slate; error as above.
- **Segmented** — `Round trip` / `One way`: two segments 44 pt, radius 8; the chosen navy with white `body-strong`.
- **Stepper** — a white card on a hairline: the icon, the label over its caption (`Adults` / `Ages 18+`), the pill
  stepper `− 1 +` in light tint; a bound dims its button to 40%.
- **Toggle** — 40.6 × 24 (07): navy on with the white knob (21 across, its own small shadow) at the right, light grey
  off (`toggle-off`); the target reaches 44 pt.
- **Calendar** (07, 24) — two months at a time, each a white card (radius 10, a soft shadow on a hairline), 6.4 apart:
  its name (`month-title`) and the arrows at its right that move both cards by a month (from this month to the last
  that can be booked, 330 days out; dimmed where they cannot go); `Mon … Sun` (`weekday`); the days 29.1 tall, 2.47
  apart across and 1.92 down, in neutral squares (radius 4.8); the departure and the return navy circles (29.7) joined
  by a light blue band (`day-band`) through the days between, rounded where a week starts or ends; days that cannot be
  chosen keep their square with a slate number. Weeks start on Monday as the images draw them (`WEEK_START`; 1.0
  started on Sunday).
- **Chip** — `trip`: light tint pill, 40 pt, an icon and navy words (`Nov 12 – 19, 2026`, `Business`, `1 adult`);
  `filter`: the status filters (09), 40 pt, `body-sm` words in `text-on-tint` 16 pt from either side — four and a part
  to a phone's width, from the gutter to the screen's edge — navy with white `label-strong` words when chosen. A chip
  that acts reaches 44 pt to the finger (`hitSlop`).
- **CabinCard** — two side by side (01): the seat icon, the cabin in `body-strong`, its line in `caption` slate on two
  lines at most, a check circle; chosen: a navy border on light tint and a filled navy check.

## Cards and rows (sheet 40)

- **InfoCard** — light tint, radius 16: the icon (in a light navy circle, or bare), a `body-strong` title, the body in
  `text-on-tint` (slate falls under 4.5:1 on the tint); optionally a `Try again` link or a chevron when the whole card
  acts.
- **OfferCard** — 124 pt wide, white, radius 20, the card shadow: the photo 116 pt, then the city (`subtitle`), the
  country (`body-sm` slate), `from` and the price (`price`), the `Save 54%` pill across the foot — the whole card above
  the tab bar at rest (02). **OfferCardWide**: the same laid
  sideways, two to a row (`To Europe`) or one across it (`To Asia`). **CarouselRow** runs to the screen's edges.
- **PopularCard** (03) — a destination as a white card: the city's photograph across the top (118 pt), then the city in
  `subtitle` over `Heathrow Airport · LHR` in slate, `from` and the price (`price-sm`) at the right, a chevron.
- **RecentRow** (03) — a recent search: a small photograph (48 × 44, radius 8), the city in `label-strong` over the
  dates searched (or the airport) in slate, a chevron; white rows 8 pt apart.
- **FlightCard** (13, 04) — a flight option, white, radius 16, the card shadow; its price says `one way`.
  `detailed` for a fare on its own (13): the airline (its logo where the fare has one, else its name) and the cabin,
  then both airports with their times and days and the plane's line between, the price at the right. `compact` for one
  of several (04): the airline at the left, the times over the codes and `Nonstop · 7h 10m`, the price at the right.
- **AirportRow** — a white card with the map pin: the city over `Heathrow Airport · LHR` and a chevron (Search), or the
  city and its code in slate at the right (onboarding).
- **YourFareCard** (05) — `Your fare` over the price in `price-display` and `one way`, `Save 48%` at the right; where
  the published fare is on record, `Down from $7,550` and, under it in `caption`, where it was published (`Sabre · 16
Sep`) — a reference price always carries its source. The weather beside it in 05 is left out (ADR-IMPL-055 §7).
- **FlightOverview** (05; sheet 40 · 07) — `Flight overview` across the top; the airline (its logo over its name, or
  the name) beside both airports, each its code (`title-sm`), its city, its clock (`+1` small) and its day, the plane
  on the slate line between them.
- **RouteCard** (05; sheet 40 · 08) — `The route` over the map: the land in white on the pale sky (the globe's land
  data, no tiles), the great circle dashed in navy and bowing up, the plane at its middle, a navy dot at each airport
  with its code over its city beside it.
- **TripSummaryCard** (06; sheet 40 · 02) — the request sheet's trip: the city's photograph, the route by its cities
  over the cabin (the airline after it when it has no logo; its logo at the right when it has one); under a rule, the
  days as the sheet holds them and the flight's clocks, then a fare's price, `one way` and `Save 48%`. A quote shows
  the route in its codes and no price.
- **TripCard** (08) — the request just received: white, radius 9, on a hairline over a light shadow (`lift`); the
  request's photograph (123.3 × 86.8, radius 8.2) at the left; `BUSINESS CLASS` over the codes with the arrow between
  them, the days, then the trip and the travelers with a dot between; at the right the airline — British Airways'
  ribbon over its name in capitals, a word to a line; else its mark, its logo or its name.
- **OfferCard · compact** (08, `Other great fares`) — 114.2 × 117.2, radius 8.1, on a hairline over a light shadow:
  the city's photograph across the top (77.6), the city over `from` and its price; three to the width, 8.55 apart. 08
  draws the price without `from`; a starting fare says so.
- **RequestCard** (09, 28; sheet 40 · 09) — a request on Requests: white, radius 20, the card shadow, 8 pt inside; the
  destination's photograph (128 pt wide, as tall as the words, radius 12) at the left; the city in `title-sm` with its
  badge at the right (a long city, or larger text, sends the badge to the next line); the route in navy over the days
  in slate, the chevron beside them; a rule; then the trip and the travelers in `body-sm` slate, each with its icon. A
  request waiting on the phone says `Your travel details are saved` on a line of its own between two rules (28). The
  whole card opens the request; its calls and retries live there. The days come as the server writes them, without a
  year (`Nov 12 – 19`).
- **TripPhotoCard** (12, `My trips`; sheet 40 · 12) — the city's photograph, 112 pt wide and at least 148 tall, radius
  16, darkened at its foot (`photo-veil`): the city in `subtitle` over the days and the route in `body-sm`, all white.
  The city keeps one line; larger text makes the card taller, never cut.
- **ProfileHero** (12) — the home city's photograph from edge to edge under the status bar (96 pt below the safe area),
  the member's portrait (`Avatar`, 120) over its foot — two thirds on the photograph — the name in `headline` and
  `Flies from JFK` in `body-lg` slate under it, centred; the round settings button over the photograph at the right.
- **ListRow / RowGroup** — rows of 56 pt in one white card (radius 16, the card shadow): the navy icon in a 24-pt
  column, the label, the value in slate, the chevron; a rule between rows from where the words start. `stacked`: the
  label small over the value. `danger`: the trash and the words in red.
- **StatusBadge** (sheet 41) — `Quote ready` navy fill, `Received` light navy, `Booked` navy outline with a check,
  `Closed` light tint, `Not sent` light navy outline; `label-strong`, 32 pt (28 beside a title).
- **SavePill** — `Save 48%`, light navy, `label-strong`; only where the published fare is on record.

## Feedback (sheet 41)

- **EmptyState** — centred: an illustration or an icon, the title in `headline`, the words in `body-lg` slate, then the
  pill (full width, or hugging its words, or an outline). 10's picture — the seat, the window over London, the globe and
  the boarding pass — is `apps/mobile/assets/images/requests-empty.webp`, cut from the image with its edges faded into
  the page.
- **StateMessage** — a page that is only a message (`This fare is unavailable.`, `Saved. It goes out when you're back
online.`): title, words, the pill.
- **NoticeCard** — a message inside a page: `error` light red with the red mark; `offline` light tint with the phone in
  a circle; `attention` light tint with the info mark; the words in `text-on-tint`; an underlined `Try again`. Over a list (28) the attention card is
  the compact `InfoCard` with the bare info mark.
- **Timeline** (11, 30–33; sheet 41, the horizontal stepper) — `Received → Quote ready → Booked`: a step reached is a
  24-pt navy circle with a white check, its name in `label-strong` and its day in slate under it; the step the request
  is at, a 22-pt navy dot in a 4-pt light navy ring; a step to come, a hollow circle on a light navy hairline, its name
  in slate. The 2-pt line between two steps is navy once the second is reached. Each step is centred over its words;
  the line runs from circle to circle. A request not sent has reached none; a closed one keeps the steps it reached
  and is at none (its badge and its message say it is closed).
- **Skeleton / CardSkeleton / RowSkeleton** — light tint blocks that shimmer (opacity only; still under reduced motion).
- **CheckCircle** — the navy disc (58.3) in a white ring (67.6 across), no shadow, the check traced from 08 (a request
  received).

## Navigation and surfaces (sheet 42)

- **TabBar** — Explore (compass), Requests (clipboard), Profile (person): the active tab a filled navy icon and a bold
  label, the others slate lines; a 6-pt navy dot on Requests while a quote is ready. White with a hairline above, to
  the screen's edge under the home indicator.
- **TopBar** — the back chevron and the wordmark centred with an action at the right (07), or the page's title in
  `headline` beside the chevron (34, 36).
- **ModalSheet** — the page dimmed by `scrim`; a white sheet, radius 24, the sheet shadow, a 40 × 5 grabber; the title
  at the left (`title` on a tall sheet, `headline` on the others) and the plain × at the right (in a light tint circle
  on `About this fare`); a question with its own answers hides the × (`showClose={false}`). Four heights (unchanged
  from 1.0): tall, explain, medium, short. Actions pinned at the foot.
- **PageModal** (07) — a whole page over the screen and its sheets: it rises like a sheet, covers the screen to its
  edges, has no grabber and no drag; its back button and Android's Back close it. The dates page is one: it opens over
  the request sheet as over Explore. Its top bar is the back chevron with the wordmark centred and 07's profile button
  at the right, which closes the page and the sheets under it before it opens Profile.
- **ModalSheet · question** (25) — a short question: its mark (the bell, traced from 25) centred over the centred
  title, no ×, the pill and the slate `Not now` under it; the page dimmed darker (`scrim-question`); the sheet as tall
  as 25 draws it, taller by a title that wraps or a taller home indicator.
- **ModalSheet · delete** (35) — the deletion: the title at the left, the words in slate (what closes with the account
  on a line of its own), the password field with the filled lock — `Password` alone in it, no eye (35 draws none) —
  the red pill and `Cancel` (navy, as text buttons are; 35 draws it slate); the page dimmed darker still
  (`scrim-delete`). The pill keeps the club's red: 35's lighter one leaves its white words at 3.6:1.
- **HomeSheet** — Explore's sheet over the globe at three stops the screen sets (02, 13, 16). At rest it is no card: the
  search bar floats on the globe's foot and the offers sit on the page, the sky fading into it; raised, it is the white
  sheet with its grabber, 24-pt corners and the sheet shadow.
- **Globe** (02, 13) — the Earth by day on the pale sky: Mapbox's satellite imagery where the build has it, else the
  drawn globe in the `globe-*` colours. Destinations are navy drop pins (18 × 25, the tip on the place) with a white
  label beside the head — the city over its price (`pin`, `pin-detail`) — placed right of the pin or else left, and left
  out where it would cover another label, a pin or a button; a chosen route shows only its two ends with their codes, a
  white line arcing between them and the plane at its middle.
- **Wordmark** — `BuyBusinessClass` Semibold and ` Club` Regular, one line, navy — over 08's daylight photograph too
  (white only over a dark one).
- **Avatar** — the member's portrait in a white ring; their initials on navy until the club keeps a photo.
