---
version: alpha
name: BBC-Club
description: Private travel-club app in two worlds. Entry is a cinematic night cabin — full-bleed photograph of empty lie-flat suites under a navy scrim, with a rising navy panel carrying serif headlines, white fields and one light pill button. Inside, the club is daylight — off-white canvas, white cards on hairlines, serif invitations, monospace flight facts, one quiet action per screen. Monochrome navy-to-grey, no accent color; hierarchy comes from light, weight, shape and photography.

colors:
  primary: "#1E293B"
  action-primary: "#1E293B"
  action-inverted: "#F8FAFC"
  surface-page: "#F8FAFC"
  surface-card: "#FFFFFF"
  surface-panel: "#1E293B"
  surface-muted: "#334155"
  text-primary: "#1E293B"
  text-secondary: "#64748B"
  text-tertiary: "#94A3B8"
  text-on-dark: "#F8FAFC"
  text-on-dark-muted: "#94A3B8"
  border-default: "#E2E8F0"
  status-danger: "#B42318"

typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: 34px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.4px
  headline:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: -0.3px
  title:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.2
  title-sm:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.35
  price:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.2px
  price-struck:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.2
  button:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.0
  label-mono:
    fontFamily: "JetBrains Mono, Menlo, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 1.5px
  facts-mono:
    fontFamily: "JetBrains Mono, Menlo, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 1px
  tab-mono:
    fontFamily: "JetBrains Mono, Menlo, monospace"
    fontSize: 9px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 1px

rounded:
  badge: 4px
  field: 12px
  card: 12px
  panel: 24px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

components:
  entry-panel:
    backgroundColor: "{colors.surface-panel}"
    rounded: "{rounded.panel}"
    padding: "{spacing.lg}"
  button-primary:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 56px
  button-inverted:
    backgroundColor: "{colors.action-inverted}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 56px
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 56px
  text-link:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
  field:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    height: 56px
    padding: "{spacing.md}"
  field-label:
    textColor: "{colors.text-secondary}"
    typography: "{typography.label-mono}"
  code-box:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.price}"
    rounded: "{rounded.field}"
    size: 48px
  section-label:
    textColor: "{colors.text-secondary}"
    typography: "{typography.label-mono}"
  proposal-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.card}"
    padding: "{spacing.md}"
  proposal-row:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.card}"
    padding: "{spacing.sm}"
  badge-for-you:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.label-mono}"
    rounded: "{rounded.badge}"
    padding: "{spacing.xxs}"
  price-published:
    textColor: "{colors.text-tertiary}"
    typography: "{typography.price-struck}"
  inbox-row:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "{spacing.md}"
  list-row:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    height: 64px
  tab-bar:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.tab-mono}"
    height: 84px
  tab-item-active:
    textColor: "{colors.primary}"
    typography: "{typography.tab-mono}"
  monogram:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.title}"
    rounded: "{rounded.field}"
    size: 56px
  photo-placeholder:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.card}"
  screen-page:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text-primary}"
    padding: "{spacing.lg}"
  panel-subline:
    textColor: "{colors.text-on-dark-muted}"
    typography: "{typography.body-sm}"
  divider:
    backgroundColor: "{colors.border-default}"
    height: 1px
  button-destructive:
    backgroundColor: "{colors.status-danger}"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 56px
---

# BBC Club — Design System

## Overview
The app should feel like a private lounge: calm, precise, expensive. Create this feeling through:
- Two worlds — entry screens on `surface-panel` over a blurred cabin photograph; inside on `surface-page` with `surface-card` on `border-default` hairlines
- Serif headlines written as invitations ("Your October in London"), body in Inter, `label-mono` uppercase for labels and flight facts
- No accent color: exactly one light pill button (`button-inverted`) per dark screen, one `button-primary` per light screen
- Generous `spacing.lg`–`spacing.xl` between groups, compact `spacing.xs` inside cards; no shadows, no gradients on UI surfaces, no urgency devices
- Photography of empty luxury spaces as the primary material; the interface recedes

## Source of Truth
Tokens and components in this file are canonical. Details live in `design/components.md` (anatomy, states, rules), `design/motion.md`, `design/agent-prompts.md`. Production code in `src/constants/club.ts` and `src/components` must match; on conflict, report it — do not improvise.

## Colors
- `primary` / `action-primary` (#1E293B): panels, primary buttons on light screens, badges, active tab. The only strong tone.
- `action-inverted` (#F8FAFC): the light pill button on dark surfaces.
- `surface-page` (#F8FAFC) canvas inside; `surface-card` (#FFFFFF) cards, rows, fields, tab bar; `surface-panel` (#1E293B) entry sheet; `surface-muted` (#334155) photo placeholders.
- `text-primary` / `text-secondary` / `text-tertiary` on light; `text-on-dark` / `text-on-dark-muted` on navy. `text-tertiary` only for non-essential lines (validity, footers, struck prices).
- `border-default` (#E2E8F0): the single 1px border color.
- `status-danger` (#B42318): error border on the field at fault and the account-deletion confirmation. Never for headlines, messages or urgency. No success/warning/info colors exist.
- Photographic scrim: gradient from transparent to rgba(30,41,59,0.92) over the bottom 45% of any photo carrying text — the only gradient, never on UI.

## Typography
- Roles never swap: every headline is serif (`display`, `headline`, `title`, `title-sm`) at weight 400; buttons are `button` (Inter 17/500); labels and flight facts are mono uppercase letterspaced.
- Body never below `body-sm` (15px); `caption` (13px) carries only non-essential lines.
- Fonts are bundled (Newsreader, Inter, JetBrains Mono); hold the splash until they load. Prototype tools may substitute Playfair/Georgia and Menlo — prototypes only.

## Layout and Responsiveness
- Single column, phones only. Gutter 24px on both worlds; all left-aligned text shares it.
- Entry panel top at 30–40% of screen height; 25% when the keyboard is open, content anchored to the panel top, primary button docked above the keyboard.
- Primary action anchored in the lower third (thumb reach). No gap inside a panel exceeds `spacing.xl` except the one deliberate breathing space between the member group and the action group on Sign In.
- Compact phones (≤375pt): photo band 25%, type scale unchanged. Large phones (>430pt): content column capped at 430pt, centered. Tablets: not supported (letterboxed).
- Font scale up to 1.3×: cards grow, nothing truncates; the price pair wraps before it shrinks. Titles max two lines then ellipsis.
- Android edge-to-edge: bottom buttons and tab bar respect safe-area insets.

## Elevation and Depth
- Level 0 flat text · Level 1 `border-default` hairline (cards, rows, fields) · Level 2 `surface-panel` over photograph · Level 3 full-bleed photograph under the scrim.
- No drop shadows anywhere; depth comes from the two worlds, the scrim and 16–24px blur behind entry panels.

## Shapes
- `rounded.pill` belongs to buttons only; fields and cards use `rounded.field`/`rounded.card` (12px); badges 4px; the entry panel 24px top corners. Shape is meaning: pills act, rectangles hold.
- Photos: full-bleed portrait on Welcome and the detail hero (hero gets 12px bottom corners), 16:9 on cards, 1:1 thumbnails at 12px. No circular crops.

## Components
Documented in `design/components.md`. Summary of the rules an agent most often gets wrong:
- One filled button per screen; label centered with the arrow directly after it; secondary actions are `text-link`, never buttons.
- `field` is white on both worlds with `field-label` above; focus strengthens the border to `text-secondary`; error = `status-danger` border on the field at fault only.
- Password fields show text by default with an eye toggle; there is no confirm-password field.
- `proposal-card` and `proposal-row` have no buttons and no chevrons — the whole surface is the tap target; prices appear as `price` beside `price-published` struck through, never as percentage chips.
- `tab-bar` shows PROPOSALS / INBOX / PROFILE; inactive labels in `text-secondary` (AA contrast), active in `primary`; unread = 6px `primary` dot.
- `button-destructive` appears only inside the account-deletion confirmation sheet, labeled with the action ("Delete my account").
- Logo: white version directly on photographs and navy, dark version on `surface-page`; never inside a plate; never recolored.

## Interaction and States
- Pressed: scale 0.98, arrow drifts 4px right, settles; no color flash. Focus: border strengthening only.
- Error, empty, offline, responded and keyboard-open states are separate frames — never stacked on one screen.
- Unread and selected states use weight plus a marker, never color alone.

## Accessibility
- Tap targets ≥44pt (iOS) / 48dp (Android); text links get a 44pt hit area.
- Contrast ≥4.5:1 for body text on both worlds; `text-tertiary` only where failure is harmless.
- `accessibilityLabel` on every interactive element; VoiceOver/TalkBack order follows visual order.
- Nothing communicated by color alone (the palette has no semantic hues to rely on).

## Motion
- Motion explains a change of state; it never decorates, except the approved Ken Burns on Welcome's cabin photograph (once per session; `design/motion.md`). Entrance: staggered fade + 12px rise, 150ms apart, ease-out, last beat starts at 1.6s and finishes by 2.5s. Screen push/pop may slide horizontally; nothing inside a screen enters from the side. Press 120ms. No bounce, no spring overshoot.
- Reduced motion: replace movement with opacity only. Details in `design/motion.md`.

## Iconography
- Thin line icons, 1.5px stroke, 20px default (18px in the tab bar), from one set (SF Symbols on iOS, Material Symbols outlined on Android, or Tabler for parity). Never filled and outlined mixed; never an icon without a label for an unfamiliar action; no airplane clip-art, no emoji.

## Product Content
- Sentence case; buttons start with a verb ("Sign in", "Create account", "I'm interested"); never "OK", "Submit", "Yes".
- Titles are invitations, facts are facts (`JFK → LHR · BUSINESS`). Any sentence that could appear in any airline app is rewritten.
- Errors say what happened and what to do next, calmly ("That doesn't match what we have. Try again, or reset it."). No urgency, no scarcity, no exclamation marks.
- The advisor appears by name exactly where a human belongs ("Julia will call you shortly."), never as a sales badge.

## Do's and Don'ts
- Do keep exactly one strong action per screen · Do write titles as invitations · Do render states as separate frames · Do use the white logo on dark surfaces.
- Don't add gold, blue, green or any hue outside the ramp · Don't add search, filters, ratings, hearts or countdowns · Don't put buttons in cards · Don't show password dots by default · Don't invent brands, prices, cabin classes or flight data — use the fixture set.

## Maintenance and Validation
- Validate on every change: `npx @google/design.md lint DESIGN.md`; compare versions with `npx @google/design.md diff`. CI fails on errors and orphaned tokens.
- Remove anything that no longer matches `src/constants/club.ts` and `src/components`. Every rule here is reusable; screen-specific decisions live in the playbook, not in this file.
- Known gaps: serif family pending ratification (Newsreader specified); onboarding components (`destination-card`, `stepper`) not yet tokenized; motion durations to be confirmed on device.
