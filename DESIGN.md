---
version: alpha
name: BBC-Club
description: Private business-class travel club, 3.0. The entry (Welcome, Sign in, Join, Verify, Set password, Reset) stays the 1.0 night cabin, frozen in apps/mobile/src/constants/club.ts. Inside, from onboarding on, the club is a bright 2026 travel app — off-white pages, white cards with soft shadows, daylight city photography, sheets with 24 pt corners that overlap the photographs, round white buttons over photos, navy pills and chips, thin line icons, one sans-serif (Inter Tight). Navy is the only accent; red only for Sign out, Delete account and errors.

colors:
  primary: "#1E293B"
  action-primary: "#1E293B"
  action-pressed: "#0F172A"
  surface-page: "#FAFAF8"
  surface-card: "#FFFFFF"
  surface-tint: "#F1F5F9"
  border-default: "#E2E8F0"
  text-primary: "#1E293B"
  text-secondary: "#64748B"
  text-on-tint: "#475569"
  text-on-photo: "#FFFFFF"
  status-danger: "#EF4444"
  status-danger-text: "#DC2626"
  status-danger-tint: "#FEF2F2"
  sky: "#BAD2EB"
  scrim: "rgba(15,23,42,0.40)"
  photo-veil: "rgba(15,23,42,0.45)"
  shadow: "#1E293B"
  globe-ocean: "#1B5E9E"
  globe-ocean-deep: "#0B3F73"
  globe-land: "#8FA77A"
  globe-desert: "#E5D3B0"
  globe-ice: "#F4F7FA"

typography:
  display:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: -0.8px
  headline:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: -0.6px
  title:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: -0.4px
  title-sm:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.3px
  subtitle:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.2px
  greeting:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 26px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.4px
  body-lg:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.2px
  body:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.1px
  body-strong:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.1px
  body-sm:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0px
  label-strong:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.1px
  caption:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0px
  label:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 1.6px
  price-display:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: -0.8px
    fontFeature: "'tnum'"
  price:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.17
    letterSpacing: -0.4px
    fontFeature: "'tnum'"
  price-sm:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: -0.2px
    fontFeature: "'tnum'"
  button:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.2px
  tab:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0px
  tab-active:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0px
  wordmark:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.4px
  pin:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.1px
  pin-detail:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: 0px

rounded:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  gutter: 20px
  lg: 24px
  xl: 32px
  xxl: 40px
  xxxl: 48px

elevation:
  card:
    offsetY: 4px
    blur: 16px
    color: "{colors.shadow}"
    opacity: 0.08
  sheet:
    offsetY: 10px
    blur: 30px
    color: "{colors.shadow}"
    opacity: 0.08
  float:
    offsetY: 6px
    blur: 20px
    color: "{colors.shadow}"
    opacity: 0.12

components:
  screen-page:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text-primary}"
    padding: "{spacing.gutter}"
  screen-title:
    textColor: "{colors.text-primary}"
    typography: "{typography.display}"
  screen-subtitle:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-lg}"
  section-title:
    textColor: "{colors.text-primary}"
    typography: "{typography.title}"
  wordmark:
    textColor: "{colors.text-primary}"
    typography: "{typography.wordmark}"
  greeting-header:
    textColor: "{colors.text-secondary}"
    typography: "{typography.greeting}"
  greeting-name:
    textColor: "{colors.text-primary}"
    typography: "{typography.display}"
  button-primary:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-photo}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 52px
  button-primary-pressed:
    backgroundColor: "{colors.action-pressed}"
    textColor: "{colors.text-on-photo}"
    rounded: "{rounded.pill}"
  button-primary-disabled:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
  button-outline:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 52px
  button-text:
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
  button-destructive:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.status-danger-text}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 52px
  button-destructive-filled:
    backgroundColor: "{colors.status-danger-text}"
    textColor: "{colors.text-on-photo}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 52px
  round-button:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    size: 44px
  field:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: 60px
  field-label:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
  field-disabled:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
  field-error:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.status-danger-text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
  search-field:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.xl}"
    height: 56px
  search-field-active:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 44px
  segmented:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    height: 44px
  segmented-selected:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-photo}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.xs}"
  chip:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: 40px
  filter-chip:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-on-tint}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: 40px
  filter-chip-selected:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-photo}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
  stepper:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-primary}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.pill}"
    height: 36px
  toggle:
    backgroundColor: "{colors.border-default}"
    textColor: "{colors.action-primary}"
    rounded: "{rounded.pill}"
    height: 32px
  cabin-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.sm}"
    height: 76px
  cabin-card-selected:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  info-card:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  error-card:
    backgroundColor: "{colors.status-danger-tint}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
  offer-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.lg}"
    width: 124px
  offer-price:
    textColor: "{colors.text-primary}"
    typography: "{typography.price}"
  save-pill:
    backgroundColor: "{colors.border-default}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    height: 28px
  popular-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.md}"
  row-price:
    textColor: "{colors.text-primary}"
    typography: "{typography.price-sm}"
  flight-option-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  request-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm}"
  trip-photo-card:
    backgroundColor: "{colors.photo-veil}"
    textColor: "{colors.text-on-photo}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.md}"
  row-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 56px
  divider:
    backgroundColor: "{colors.border-default}"
    height: 1px
  label:
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
  caption:
    textColor: "{colors.text-secondary}"
    typography: "{typography.caption}"
  price-hero:
    textColor: "{colors.text-primary}"
    typography: "{typography.price-display}"
  badge-quote-ready:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-photo}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    height: 32px
  badge-received:
    backgroundColor: "{colors.border-default}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    height: 32px
  badge-booked:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    height: 32px
  badge-closed:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    height: 32px
  badge-not-sent:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    height: 32px
  progress-steps:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-photo}"
    typography: "{typography.body-sm}"
    size: 24px
  progress-line:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.border-default}"
    rounded: "{rounded.pill}"
    height: 4px
  skeleton:
    backgroundColor: "{colors.surface-tint}"
    rounded: "{rounded.sm}"
  check-circle:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-photo}"
    rounded: "{rounded.pill}"
    size: 64px
  empty-state:
    textColor: "{colors.text-primary}"
    typography: "{typography.headline}"
  bottom-sheet:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.headline}"
    rounded: "{rounded.xl}"
    padding: "{spacing.gutter}"
  sheet-backdrop:
    backgroundColor: "{colors.scrim}"
  top-bar:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text-primary}"
    typography: "{typography.wordmark}"
    height: 52px
  tab-bar:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.tab}"
    height: 56px
  tab-item-active:
    textColor: "{colors.primary}"
    typography: "{typography.tab-active}"
  globe-page:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.text-primary}"
  globe-pin:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.primary}"
    typography: "{typography.pin}"
    rounded: "{rounded.xs}"
  globe-pin-detail:
    textColor: "{colors.primary}"
    typography: "{typography.pin-detail}"
  globe-ocean:
    backgroundColor: "{colors.globe-ocean}"
  globe-ocean-deep:
    backgroundColor: "{colors.globe-ocean-deep}"
  globe-land:
    backgroundColor: "{colors.globe-land}"
  globe-desert:
    backgroundColor: "{colors.globe-desert}"
  globe-ice:
    backgroundColor: "{colors.globe-ice}"
  elevation-shadow:
    backgroundColor: "{colors.shadow}"
  error-text:
    textColor: "{colors.status-danger}"
    typography: "{typography.title}"

motion:
  press: 120
  release: 160
  fade: 200
  panel: 300
  fill: 400
  shimmer: 1400
---

# BBC Club — Design System 3.0

## Overview

BuyBusinessClass Club is a private business-class travel club: members see fares from their home airport, request a
quote, and a travel specialist arranges the trip by phone. 3.0 (ADR-IMPL-055) makes the inside a bright, modern 2026
travel app — airy white space, daylight photography of the cities, white cards with soft shadows, sheets that overlap
the photographs with 24 pt corners, round white buttons over photos, navy pills and chips, thin line icons, Apple-level
clean UI with luxury travel branding.

- **Two worlds.** The entry — Welcome, Sign in, Join, Verify, Set password, Reset — stays the 1.0 night cabin, exactly
  as it is: its values live in `apps/mobile/src/constants/club.ts`, written by hand and pinned by `club.test.ts`; none
  of the tokens below reaches it. Everything from onboarding on is 3.0.
- **The reference.** The 46 images in `isolated/bbc-club-3.0-design/final/` — 13 screens, 23 states, 8 component
  sheets — show every screen and element; this file holds their values. Where an image and this file differ, this file
  wins (the images are generated and not always consistent with one another); where an image shows something the app
  has no data for, the app leaves it out rather than invent it (ADR-IMPL-055).
- **One accent.** Navy is the only strong colour: text, filled buttons, the selected chip and the active tab. Red only
  for Sign out, Delete account and errors.

## Source of Truth

Tokens and components in this file are canonical for the club; `design/components.md` gives each component's anatomy
and states, `design/motion.md` its motion. The generated `packages/ui/src/tokens.ts` comes from the front matter
(`bun run tokens`, never edited by hand). The entry is the exception: `club.ts`, frozen.

## Colors

- **Navy** `primary` / `action-primary` (#1E293B): text, filled pills, selected chips and segments, the active tab, the
  pins, the stepper's done steps. `action-pressed` (#0F172A) while a filled pill is pressed.
- **White** `surface-card` (#FFFFFF): cards, sheets, fields, the tab bar. **Off-white** `surface-page` (#FAFAF8): pages.
- **Light tint** `surface-tint` (#F1F5F9): chips, info cards, filled search fields, the stepper, a disabled pill,
  skeletons, the Closed badge.
- **Light navy** `border-default` (#E2E8F0): borders, dividers, the light badges (Received), the `Save 48%` pill, the
  progress line's track.
- **Slate** `text-secondary` (#64748B): secondary text, placeholders, inactive tabs, labels; `text-on-tint` (#475569)
  for words on the light tint (an inactive filter chip), where slate would fall under 4.5:1.
- **Pale sky** `sky` (#BAD2EB): only behind the globe. The `globe-*` colours are the drawn globe's imagery (ocean, land,
  desert, ice) — never UI.
- **Red** `status-danger` (#EF4444): the border and icon of `Sign out`, `Delete account` and a field at fault;
  `status-danger-text` (#DC2626) for their words and the filled `Delete account` pill — the same red a step darker, so
  the words keep 4.5:1 on white (#EF4444 gives 3.76:1); `status-danger-tint` behind an error card.
- `text-on-photo` (#FFFFFF): words on photographs and on navy. `photo-veil` darkens the foot of a photograph that
  carries words; `scrim` dims the page under a sheet; `shadow` is the colour of every shadow.
- No gold, bronze, orange, yellow, green or azure anywhere in the UI.

## Typography

One sans-serif, Inter Tight (the bundled `@expo-google-fonts/inter-tight` 400, 500, 600, 700), everywhere inside; no
serif.

- `display` 36 Bold: screen titles (`Requests`, `London`, `New York to London`), the member's name in the greeting.
- `headline` 30 Bold: the onboarding question, sheet titles, empty and confirmation titles (`No requests yet.`,
  `Request received.`).
- `title` 24 Bold: section titles (`Offers to inspire`, `To Europe`, `My trips`, `Request progress`).
- `title-sm` 20 Bold: card titles (the city on a request), the smaller section titles (`Popular from New York`,
  `Recent searches`, `Flight option`).
- `subtitle` 17 Semibold: row and group titles (`Your home airport`, `Adults`), the city on an offer or a popular card.
- `greeting` 26 Regular in slate: `Good morning,`.
- `body-lg` 18: subtitles under a title, the search field's words. `body` 16 and `body-strong` 16 Semibold: text and
  the titles of info cards. `body-sm` 14: secondary lines; `label-strong` 14 Semibold: badges, the `Save 48%` pill,
  small titles in cards. `caption` 12: fine print (`No payment is taken in the app.`).
- `label` 11 Semibold, uppercase, letter-spaced, slate: `INDICATIVE FARE`, `LOCAL TIME`, `BUSINESS CLASS`.
- `price-display` 36, `price` 24, `price-sm` 18: Bold with tabular figures.
- `button` 17 Semibold. `tab` 12 Medium, `tab-active` 12 Bold.
- `wordmark`: `BuyBusinessClass` in Bold and ` Club` in Regular, on one line, navy (white over photos).
- `pin` 13 Bold and `pin-detail` 13: the globe's labels — a city over its price, an airport's code at either end of a
  route (02, 13).
- Body never below 14; `caption` only for fine print, `pin` and `pin-detail` only on the globe. Titles wrap to two
  lines at most.

## Layout and Responsiveness

- Single column, phones only; 20 pt gutters (`spacing.gutter`); horizontal carousels run to the screen's edge and
  start at the gutter. Content capped at 430 pt on large phones, centred.
- The primary action sits in the lower third: pinned over the tab bar on a page, at the foot of a sheet.
- Font scale up to 1.3×: cards grow; nothing truncates but one-line titles in carousels.
- Android edge-to-edge: the tab bar and the pinned actions respect the safe-area insets.

## Elevation and Depth

- Cards and the search field: the card shadow `0 4 16` at 8% of `shadow`; sheets: `0 10 30` at 8%; round white buttons
  over photos and the globe's labels: `float`. Shadows come from the `elevation` group (generated as `boxShadow`).
- Sheets overlap photographs with 24 pt top corners; photographs run to the screen's edges under the status bar.

## Shapes

- `pill` for buttons, chips, badges, the stepper, the search field on a page; `xs` 8 for the segmented control and small
  thumbnails; `sm` 12 for fields and cabin cards; `md` 16 for cards and rows; `lg` 20 for offer and request cards;
  `xl` 24 for sheets and photo cards.

## Components

Documented in `design/components.md`. The rules an agent most often gets wrong:

- One filled navy pill per screen; it may carry an arrow after its label (`Continue →`) or an icon before it
  (`Call your specialist`). A second action is an outline pill or a text button.
- Destructive actions are red: the outline pill `Sign out`, the row `Delete account`, and the filled red pill only to
  confirm a deletion.
- Badges: `Quote ready` navy, `Received` light navy, `Booked` navy outline with a check, `Closed` light tint,
  `Not sent` light navy outline.
- The tab bar: Explore (compass), Requests (clipboard), Profile (person); the active tab a filled navy icon and a bold
  label, the others slate line icons; a 6 pt navy dot on Requests while a quote is ready.

## Interaction and States

- Pressed: a filled pill turns `action-pressed`; cards and rows dim to 85%. Focus: a navy border. Disabled: light tint
  with slate words. Error: a red border and red words under the field.
- Loading lists show skeletons in light tint that shimmer; a pill that sends shows a small white spinner and `Sending…`.
- Error, empty, offline and loading are separate states, never stacked on one screen.

## Accessibility

- Tap targets ≥ 44 pt; contrast ≥ 4.5:1 for body text; `accessibilityLabel` on every interactive element; reading order
  follows the visual order; nothing said by colour alone (badges have words, the selected chip is filled).

## Motion

- Motion explains a change of state; nothing bounces. Press 120 ms, release 160, fades 200, sheets and panels 300, the
  onboarding progress line fills over 400 ms, skeletons shimmer over 1.4 s. Reduced motion: opacity only, no shimmer.
  Details in `design/motion.md`.

## Iconography

- Lucide line icons, 1.75 stroke, 20 pt in rows and fields, 24 pt in the tab bar and on round buttons. The tab bar's
  active icons are filled (drawn in `packages/ui`). No emoji.

## Product Content

- Sentence case; buttons start with a verb (`Request a quote`, `Use these dates`, `Call your specialist`).
- Facts are facts: a fare is one way and says so; `round trip` only on an indicative fare; `Save 48%` only where the
  published fare is on record; no rating, saved count, weather, city description or member photo until the club has
  them (ADR-IMPL-055). The specialist confirms availability and books by phone; no payment in the app.
- Errors say what happened and what to do next, calmly. No urgency, no scarcity, no exclamation marks.

## Do's and Don'ts

- Do keep one filled pill per screen · Do let sheets overlap the photographs · Do use the city's own photograph
  everywhere it appears · Do render states as separate frames.
- Don't add colours outside the palette · Don't use serif type inside · Don't print numbers the club does not have ·
  Don't touch the entry (its values are `club.ts`).

## Maintenance and Validation

- Validate on every change: `bun run design:lint`; regenerate with `bun run tokens` (CI runs `tokens:check`).
- The `elevation` group is the club's own extension of the format: the linter reports it as ignored by its exports, and
  `scripts/tokens.ts` generates it.
