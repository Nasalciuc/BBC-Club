# BBC Club — Components (anatomy, states, rules)

Companion to `DESIGN.md`. Token refs are canonical; this file adds the decisions an agent would otherwise guess.

## Buttons

**button-inverted** (dark screens) · **button-primary** (light screens) — exactly one filled button per screen (Figma Button 7:12).

- Anatomy: full width, height 56, `rounded.pill`, 16 padding, label `typography.button` centered and alone — no arrow, no icon (the entry keeps its own, below).
- Pressed: scale 0.98, settle; no color change. Disabled: Primary turns `surface-muted` at 50% with its label in `text-on-dark-muted` (7:8); the other tones dim to 45% (the entry's Sign in, 66:182). Sending: the button keeps its tone and reads `Sending…` / `Saving…`, taps blocked (7:10); no spinner.
- **button-secondary**: `surface-card` on a 1px `border-default` hairline, label `text-primary` (7:6); beside a filled one (Profile's Edit and Call us, Sign out).
- **text-link**: tertiary actions (Forgot password?, Not now, Sign in); `text-secondary`, 44pt hit area; never styled as a button. An ErrorState's support link (`Call a specialist`) is `body-sm` `text-secondary`, 48pt.
- **The entry's buttons** stay as they are (the owner, 14 Oct; `club-button`): the light pill with the arrow directly after the label; **button-outlined** — transparent, 1px border in `text-on-dark-muted`, label `text-on-dark` — for Sign in's Create account, under the NEW TO THE CLUB divider; 45% while they cannot be pressed.
- **button-destructive**: only inside the account-deletion sheet (320:5810), `Delete account`, the 48pt secondary `Cancel` 12pt under it.

## Fields

**field** — white on both worlds; `field-label` (mono uppercase) above; placeholder `text-secondary` (Figma SearchField 28:42, whose states are every field; the entry's fields keep `text-tertiary` until the entry screens follow Figma).

- Search field: the 20pt magnifier at the left in every state; once filled, `Clear` — a 60×48 text button reaching to the field's right edge, in `button` while typing (89:388) and `body-sm` on a chosen route (89:387); disabled dims the whole field to 40%.
- **text-field** (`TextField`; Figma 28:42's text and Phone states, 319:192): the label 8pt over the white 56pt field, the words 16pt in, no magnifier — that is the search field's. The request sheet's labels are `field-label` (`NAME`, `PHONE`, `EMAIL`); the short sheets' are sentence case in `caption` (`Phone number`, `Password`), Change password's in `body-sm` (238:4974). Inside a sheet the input is gorhom's on a phone, React Native's on the web (`SheetTextInput`).
- Focus: border 1.5px `text-secondary`; one focused field at a time.
- Error: 1px `status-danger` border on the field at fault; message in `caption`, `text-secondary`, near the recovery action; nothing shakes.
- Password (`PasswordField`): hidden until the eye shows it (Figma 238:5125, 325:8392) — the eye in a 44pt target at the right, `text-secondary`; `Enter password`; `textContentType`/`autoComplete` set; only Change password confirms the new one (238:4974).
- **code-box** ×6: 48px, first auto-focused, `oneTimeCode` autofill; error = `status-danger` border on all six + one calm line.
- Checklist (password rules): hollow circle → subtle filled check; satisfied = brighter text; never green.

## Cards and rows

**proposal-card** — photo 16:9 top (`rounded.card` top corners) with `badge-for-you` top-left; body: `title` invitation, `body-sm` context line ("You flew this route in March."), two `facts-mono` lines (`JFK → LHR · BUSINESS`, `NONSTOP · 7H 05 · LIE-FLAT SUITE`), price row = `price` + `price-published` (line-through), `caption` validity. Whole card tappable; no buttons, no chevrons.
**proposal-row** — 56–64px square photo left (`rounded.field`), `title-sm`, one `facts-mono` line, `price` + `price-published`. Whole row tappable.
**request-card** — Figma `Proposal / RequestCard` (436:1169): `surface-card` on a `border-default` hairline, `rounded.card`; the destination's city in `headline` (Full, on Requests) or `title` (Compact, on Profile) with the `status-badge` beside it, then two `facts-mono` lines (`JFK → LHR · BUSINESS`, `OCT 12–19 · 1 ADULT`; a request waiting on the phone: `Your travel details are saved` — one that will not go out by itself keeps its dates and its `Not sent` badge). Whole card tappable; no buttons — calls and retries live in the request. A screen reader hears words, not the mono signs: `London, quote ready, JFK to LHR, business, October 12 to 19, 1 adult`.
**status-badge** — Received · Quote ready · Booked · Not sent, sentence case in `caption` (Figma 26:20 — `DESIGN.md` gives `caption` to non-essential lines and labels to `label-mono`: a conflict reported in ADR-IMPL-041, A2c). Only Quote ready is filled (`action-primary`); the others are a `border-default` hairline frame on `surface-card`, Not sent included — no danger colour, no urgency; the fill keeps the words at 4.5:1 on the porcelain page (Figma draws it transparent). 32pt in a card, 24pt under a request's title — there at least 88pt wide (104 for Quote ready; Not sent hugs its words), as Figma draws them.
**timeline** — the four request milestones in a card (`surface-card`, hairline, 24pt padding, 80pt a step): a done step is a check in a circle joined to the next done step by a `text-primary` line; the current step's caption in `body-sm` (a specialist's note on that step takes its place — the latest one); future steps hollow in `border-default` with `text-secondary` labels. No dates. Each step says in words whether it is done, current or not yet.
**price-pair** — a fare row shows the offer alone, in `price`, as Figma's FareRow (32:2, 89:387) draws it — the published fare and its source are on the fare's page (ADR-IMPL-041, 13 Oct), and `stack` (the struck published fare over the offer) is on no screen now; `editorial` on a fare's page (`Your fare` and the price in `display`, the published fare 24pt beside it — under it at larger text, 436:1106); `detail` on a request's detail (Figma 26:29: `YOUR FARE` over the price, a 144pt column, the published fare struck beside it with its source — only at Quote ready, and only when the server recorded both as the member asked, ADR-IMPL-046). On a request the price is `text-primary`, not bronze (the conflict in ADR-IMPL-041, A2c); Figma 26:36's description ("Detail for fare pages") predates that use.
**inbox-row** — one `body` sentence + `caption` date; unread = 6px `primary` dot left + weight 500; read = `text-secondary`.
**list-row** — Figma ListRow (37:72): a `surface-card` card, 64pt, `rounded.card`, 16/12 padding; `body` label, the value in `body-sm` `text-secondary` at the right, a 20pt chevron `text-secondary`; an action has no value; disabled 40%; a switch (48×28 in a 48×44 target, navy on / hairline off) replaces the chevron; `size="sm"` is 56pt (the fare's `Why it's $X lower`, 135:845; Settings' legal rows); `trailing="external"` puts `↗` in the value's place for a page outside the app (479:8279); a locked switch (`Request updates`, always on) draws its label and switch at 40% on the white card (238:5502). Rows stand 8pt apart, no hairline between them.
**section-label** — `label-mono` in `text-secondary`, uppercased: the 24pt-above / 12pt-below rhythm, or, in Explore's sheet, Figma's 32pt box with no margins of its own (`box`, 26:40) — its action an 80×48 text button (`See all`, 97:433) — the row grows to the 48 and gives the 8pt back above and below, so the whole target lies inside it and the box keeps its 32pt in the rhythm —, its trailing value at the right (`LONDON · 8:42 PM`).
**fare-row** — Figma FareRow (32:2, 89:387): 88pt, the airline's 32pt monogram, its name, the stops and the time in the air (`NONSTOP · 7H 05` — the clocks are the fare page's) and the product; the price alone at the right; rows 8pt apart. **estimate-row** (536:10635): the same 88pt, `≈` in the 32pt tile.
**airport-row** — Figma AirportRow (28:65): white, 72pt, 16/12 padding; the city in `body` over the airport's name in `caption`, the IATA code in `facts-mono` at the right; Selected: `surface-page` with a 1px `primary` border and a check; Recent: a clock. No flag, no plane. Rows 8pt apart in a sheet, 12pt in Explore's typing.
**chip** — Figma Chip (26:8): 48pt, `rounded.field`, `body-sm` label alone, white on a hairline; selected `action-primary` with `text-on-dark`; disabled 40%. Trip type and the onboarding cabins share their row evenly; Explore's three preferences span it; a cabin sheet's two cabins are 56pt, one under the other across the sheet, 24pt apart (238:4710).
**stepper** — Figma Stepper (47:46): a white card on a hairline, 80pt, 16 padding; minus and plus 48pt squares (`rounded.field`, `surface-page`, hairline), the count between them; a bound dims its button to 40%.
**empty-state / error-state** — Figma 48:18 / 50:54: left-aligned, `headline` title, `body` in `text-secondary`, 24pt to one full-width primary button; an error's support link 8pt under it. No illustration; the screen gives the gutters. A page-wide message (`SystemScreen`: a first load that failed, update required, maintenance — 240:5093, 240:5129, 240:5163): the wordmark at the safe area, the message 48pt under it, `Call a specialist` as a secondary button 12pt under its action.
**photo-placeholder** — `surface-muted`, exact image slot (blurhash in production); never a spinner. A photo that cannot load shows the club's cabin photograph instead (`Photo`, ADR-IMPL-043).
**profile-hero** — Figma `Proposal / ProfileHero` (436:1221): the home airport's city photograph, 304 pt high, `rounded.card`, under a flat `surface-night` scrim at 32 %; the member's name in `headline` (`text-on-dark`, two lines at most) and `Flies from JFK` in `body-sm` on a white pill (144 × 36 pt, its words centred, `border-default` hairline) — a pill that does not act, as Figma draws it (reported in ADR-IMPL-043). Under it, `Edit` and `Call us`: two white pills 48 pt high, 12 pt apart.
**photo-credit** — one `caption` line in `text-tertiary` under a photograph shown full width (a fare's photo band, Profile's): `Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons`, `Imagery © Mapbox © OpenStreetMap © Maxar` under a satellite view; it opens the photo's page (44 pt hit area). A card's photo is credited on the fare page it opens.

## Navigation

**tab-bar** — three items EXPLORE / REQUESTS / PROFILE (as `DESIGN.md` and Figma 03 · Components say), `tab-mono` labels, 24pt line icons; inactive `text-secondary`, active `primary`; unread = 6px `accent-warm` dot on Requests. Figma TabBar (41:39): white, no rule above; 4pt, three 48pt targets sharing the width, then the home indicator's inset (at least 32pt) — the bar's white runs to the screen's edge. No pills, no highlight bars, no hamburger, no drawer.
**modal-sheet** — Figma's sheets (135:849, 238:4561, 320:5969): the page under `surface-night` at 35% (a tap closes it, except while sending or saving); `surface-page`, `rounded.panel` top corners, a 48×4 `border-default` handle 8pt from the top. Four heights, from the sheet's top on the 852pt frame: tall 104 (edit sheets, the request, the calendar), explain 256, medium 224 (a question or a confirmation), short 360 (one field). The header 24pt down: a `title` in 44pt, or a `headline` in 64pt for a question or one field, then the `close-button` after Figma's 257pt (281pt) title box. Content from 88pt (120 under a headline), its blocks 24pt apart; the actions pinned at the bottom (68pt above the edge on a tall sheet, 48 under a question, 108 under one field — on a phone shorter than the frame this gap gives way first; never closer than 12pt above the home indicator). With the keyboard up the sheet rises above it, never under the status bar, its actions 12pt over the keys (a field in a sheet is gorhom's input); each new error scrolls into view with the field at fault. While a request sends there is no × (`closable={false}`, 135:854): a title's header is its line alone, so the title rises 10pt.
**home-sheet** — Explore's sheet (Figma HomeSheet 52:24): 300 / 544 / 656pt of the 768pt above the tab bar (rest; a chosen route; typing and expanded), exact fractions; the 32×4 handle 12pt from the top and 12pt from the field. A route's empty, offline and on-request states are a page (`page`): no handle, no drag.
**close-button** — Figma 299:200: 44×44 target, a 32pt circle filled `border-default`, the × in `text-primary`, 14pt across as Figma draws it. **back-button** — 299:197: 44×44, the 24pt chevron 6pt from its left edge.
**calendar** — Figma Calendar (322:1446): Sunday-first; 48pt days in a 336pt grid centred in the sheet; the month in `title-sm`, the weekdays in `caption`, 12pt apart; the chosen days a 48pt `action-primary` circle, the range one 32pt `border-default` band; past days `text-tertiary`, not tappable; months 24pt apart.
Back: white arrow on photographs (entry, detail hero); Android hardware back mirrors it. Forward = push slide-left 300ms; back = pop slide-right; tab switch = no slide.

## Surfaces

**entry-panel** — `surface-panel`, `rounded.panel` top corners, rises over the blurred cabin photo; top edge 30–40% (25% keyboard-open).
**screen-page** — inside world canvas, 24px gutter.
**divider** — 1px `border-default`; with a centered `label-mono` when it separates action groups ("NEW TO THE CLUB").
**monogram** — `action-primary` rounded square, serif initials in `text-on-dark`.

## Signature compositions

- The rising panel (all auth steps over one photograph) · the FOR YOU card · the price pair · the advisor line ("Curated by Julia." / "Julia will call you shortly.") · the threshold (last dark screen → light feed).

## Photography

Empty spaces only (no people), insider perspective (from the suite, from the table), muted cinematic grade, deep shadows, restrained warm light; never landmarks, crowds, postcards, HDR. Scrim over the bottom 45% wherever text sits. Card images 2× WebP from CDN; hero 3×.

City photographs (ADR-IMPL-043) are the exception this paragraph does not yet name: an offer without its own picture, a fare's photo band and Profile show the city's photograph from Wikimedia Commons or Pexels (people left out by their description), else its satellite view, else the cabin photograph. Many are skylines or landmarks — reported in ADR-IMPL-043; the club's own photo replaces any city's.
