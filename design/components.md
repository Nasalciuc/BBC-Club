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
**request-card** — Figma `Proposal / RequestCard` (436:1169): `surface-card` on a `border-default` hairline, `rounded.card`; the destination's city in `headline` (Full, on Requests) or `title` (Compact, on Profile) with the `status-badge` beside it, then two `facts-mono` lines (`JFK → LHR · BUSINESS`, `OCT 12–19 · 1 ADULT`; a request waiting on the phone: `Your travel details are saved` — one that will not go out by itself keeps its dates and its `Not sent` badge). Whole card tappable; no buttons — calls and retries live in the request. A screen reader hears words, not the mono signs: `London, quote ready, JFK to LHR, business, October 12 to 19, 1 adult`.
**status-badge** — Received · Quote ready · Booked · Not sent, sentence case in `caption` (Figma 26:20 — `DESIGN.md` gives `caption` to non-essential lines and labels to `label-mono`: a conflict reported in ADR-IMPL-041, A2c). Only Quote ready is filled (`action-primary`); the others are a `border-default` hairline frame on `surface-card`, Not sent included — no danger colour, no urgency; the fill keeps the words at 4.5:1 on the porcelain page (Figma draws it transparent). 32pt in a card, 24pt under a request's title.
**timeline** — the four request milestones in a card (`surface-card`, hairline, 24pt padding, 80pt a step): a done step is a check in a circle joined to the next done step by a `text-primary` line; the current step's caption in `body-sm` (a specialist's note on that step takes its place — the latest one); future steps hollow in `border-default` with `text-secondary` labels. No dates. Each step says in words whether it is done, current or not yet.
**price-pair** — `stack` on cards and fare rows (struck published fare over the offer); `editorial` on a fare's page (`Your fare` and the price in `display`, the published fare beside it); `detail` on a request's detail (Figma 26:29: `YOUR FARE` over the price, a 144pt column, the published fare beside it). On a request the price is `text-primary`, not bronze (the conflict in ADR-IMPL-041, A2c); Figma 26:36's description ("Detail for fare pages") predates that use.
**inbox-row** — one `body` sentence + `caption` date; unread = 6px `primary` dot left + weight 500; read = `text-secondary`.
**list-row** — `body` label, thin chevron `text-tertiary` right; "Sign out" has no chevron.
**photo-placeholder** — `surface-muted`, exact image slot (blurhash in production); never a spinner. A photo that cannot load shows the club's cabin photograph instead (`Photo`, ADR-IMPL-043).
**profile-hero** — Figma `Proposal / ProfileHero` (436:1221): the home airport's city photograph, 304 pt high, `rounded.card`, under a flat `surface-night` scrim at 32 %; the member's name in `headline` (`text-on-dark`, two lines at most) and `Flies from JFK` in `body-sm` on a white pill (36 pt, `border-default` hairline) — a pill that does not act, as Figma draws it (reported in ADR-IMPL-043). Under it, `Edit` and `Call us`: two white pills 48 pt high, 12 pt apart.
**photo-credit** — one `caption` line in `text-tertiary` under a photograph shown full width (a fare's photo band, Profile's): `Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons`, `Imagery © Mapbox © OpenStreetMap © Maxar` under a satellite view; it opens the photo's page (44 pt hit area). A card's photo is credited on the fare page it opens.

## Navigation

**tab-bar** — three items EXPLORE / REQUESTS / PROFILE (as `DESIGN.md` and Figma 03 · Components say), `tab-mono` labels, line icons; inactive `text-secondary`, active `primary`; unread = 6px `accent-warm` dot on Requests. No pills, no highlight bars, no hamburger, no drawer.
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
