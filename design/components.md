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
- **Toggle** — 52 × 32; navy on with the white knob at the right, light navy off.
- **Chip** — `trip`: light tint pill, 40 pt, an icon and navy words (`Nov 12 – 19, 2026`, `Business`, `1 adult`);
  `filter`: the status filters, slate words, navy with white bold words when chosen.
- **Cabin card** — two side by side: the seat icon, the cabin in `subtitle`, its line in slate, a check circle; chosen:
  a navy border on light tint and a filled navy check.

## Cards and rows (sheet 40)

- **InfoCard** — light tint, radius 16: the icon (in a light navy circle, or bare), a `body-strong` title, the body in
  slate; optionally a `Try again` link or a chevron when the whole card acts.
- **OfferCard** — 124 pt wide, white, radius 20, the card shadow: the photo 144 pt, then the city (`title-sm`), the
  country (slate), `from` and the price (`price`), the `Save 54%` pill across the foot. **OfferCardWide**: the same laid
  sideways, two to a row (`To Europe`) or one across it (`To Asia`). **CarouselRow** runs to the screen's edges.
- **AirportRow** — a white card with the map pin: the city over `Heathrow Airport · LHR` and a chevron (Search), or the
  city and its code in slate at the right (onboarding).
- **ListRow / RowGroup** — rows of 56 pt in one white card (radius 16, the card shadow): the navy icon in a 24-pt
  column, the label, the value in slate, the chevron; a rule between rows from where the words start. `stacked`: the
  label small over the value. `danger`: the trash and the words in red.
- **StatusBadge** (sheet 41) — `Quote ready` navy fill, `Received` light navy, `Booked` navy outline with a check,
  `Closed` light tint, `Not sent` light navy outline; `label-strong`, 32 pt (28 beside a title).
- **SavePill** — `Save 48%`, light navy, `label-strong`; only where the published fare is on record.

## Feedback (sheet 41)

- **EmptyState** — centred: an illustration or an icon, the title in `headline`, the words in `body-lg` slate, then the
  pill (full width, or hugging its words, or an outline).
- **StateMessage** — a page that is only a message (`This fare is unavailable.`, `Saved. It goes out when you're back
online.`): title, words, the pill.
- **NoticeCard** — a message inside a page: `error` light red with the red mark; `offline` light tint with the phone in
  a circle; `attention` light tint with the info mark; an underlined `Try again`.
- **Skeleton / CardSkeleton / RowSkeleton** — light tint blocks that shimmer (opacity only; still under reduced motion).
- **CheckCircle** — the large navy check in a white ring (a request received).

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
- **HomeSheet** — Explore's white sheet over the globe, its grabber, its three stops.
- **Wordmark** — `BuyBusinessClass` Bold and ` Club` Regular, one line; white over photographs.
- **Avatar** — the member's portrait in a white ring; their initials on navy until the club keeps a photo.
