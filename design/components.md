# BBC Club — Components (anatomy, states, rules)
Companion to `DESIGN.md`. Token refs are canonical; this file adds the decisions an agent would otherwise guess.

## Buttons
**button-inverted** (dark screens) · **button-primary** (light screens) — exactly one filled button per screen.
- Anatomy: full width, height 56, `rounded.pill`, label `typography.button` centered, optional arrow directly after the label (never at the far edge).
- Pressed: scale 0.98, arrow +4px right, settle; no color change. Disabled: opacity 0.5, never a different color.
- **button-outlined**: transparent, 1px border in `text-on-dark-muted`, label `text-on-dark`; the secondary action (Create account).
- **text-link**: tertiary actions (Forgot password?, Not now, Sign in); `text-secondary`, 44pt hit area; never styled as a button.
- **button-destructive**: only inside the account-deletion confirmation; label names the action.

## Fields
**field** — white on both worlds; `field-label` (mono uppercase) above; placeholder `text-tertiary`.
- Focus: border 1.5px `text-secondary`; one focused field at a time.
- Error: 1px `status-danger` border on the field at fault; message in `caption`, `text-secondary`, near the recovery action; nothing shakes.
- Password: visible text by default, eye toggle inside right (`text-secondary`); `textContentType`/`autoComplete` set; no confirm-password field.
- **code-box** ×6: 48px, first auto-focused, `oneTimeCode` autofill; error = `status-danger` border on all six + one calm line.
- Checklist (password rules): hollow circle → subtle filled check; satisfied = brighter text; never green.

## Cards and rows
**proposal-card** — photo 16:9 top (`rounded.card` top corners) with `badge-for-you` top-left; body: `title` invitation, `body-sm` context line ("You flew this route in March."), two `facts-mono` lines (`JFK → LHR · BUSINESS`, `NONSTOP · 7H 05 · LIE-FLAT SUITE`), price row = `price` + `price-published` (line-through), `caption` validity. Whole card tappable; no buttons, no chevrons.
**proposal-row** — 56–64px square photo left (`rounded.field`), `title-sm`, one `facts-mono` line, `price` + `price-published`. Whole row tappable.
**inbox-row** — one `body` sentence + `caption` date; unread = 6px `primary` dot left + weight 500; read = `text-secondary`.
**list-row** — `body` label, thin chevron `text-tertiary` right; "Sign out" has no chevron.
**photo-placeholder** — `surface-muted`, exact image slot (blurhash in production); never a spinner.

## Navigation
**tab-bar** — three items PROPOSALS / INBOX / PROFILE, `tab-mono` labels, 18px line icons; inactive `text-secondary`, active `primary`; unread dot on Inbox. No pills, no highlight bars, no hamburger, no drawer.
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
