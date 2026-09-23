# What happens after the home screen

Read off Mobbin. Three distinct patterns for "the member tapped something on the feed —
now what". BBC Club needs a hybrid of two of them, and must avoid most of the third.

---

## Pattern A — the commerce detail

Home → tap a card → a detail page → a **sticky bottom bar holding the price and the action**.
This is the universal convention; all four apps do it the same way.

| App                                                                        | Detail anatomy                                                                                                                                                            | The bottom bar                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Viator](https://mobbin.com/screens/42dd6965-7db3-4dfb-a66d-1c29699a95a4)  | Hero photo with back / heart / share as circles **on** the photo; title; `From $25.65 per person`; 4.8 ★ 970 Reviews; "Book ahead!"; "Free cancellation"                  | `From $25.65` + `Lowest Price Guarantee` left · green `Check availability` right |
| [Expedia](https://mobbin.com/screens/435feb93-cac2-4ead-ac17-295e87995114) | Breadcrumb `NYC › Delta·NYC→SFO › Review your package`; a OneKeyCash banner; `Stay` + dates; hotel card with photo, room, `Non-refundable`, 8.6/10                        | `$1,276` `$̶1̶,̶8̶9̶8̶` + `View price summary` left · blue `Next: Final details` right |
| [Careem](https://mobbin.com/screens/f501d07d-d4d4-4bf8-9273-955ea199a07b)  | Hero photo; `Save up to 35%`; a card with `20 rides` / `AED 484`; `Travel between` rows with `Edit →`                                                                     | Full-width green `Buy Package`                                                   |
| [Booking](https://mobbin.com/screens/25aa34aa-3211-47f9-b70c-1772c8a4f5f1) | Hero card `Sandusky / Mar 19–20, 2026`; then the trip is **a list of action rows**: `Track your requests ›`, `Get a better room for just US$11.38 ›`, `Request invoice ›` | none — the rows are the actions                                                  |

**The one mechanic worth taking:** price and action live together, anchored at the bottom.
`DESIGN.md` already asks for the primary action in the lower third; this confirms the shape.

**Booking's second idea:** once a thing is _agreed_, the detail stops being a document and
becomes a short list of things you can now do. That is a model for our responded state.

---

## Pattern B — the concierge escalation

This is the pattern BBC Club actually is. Nobody transacts in-app; the app hands off to a
human and says so.

### [Wise — request a phone call](https://mobbin.com/flows/4a30fe8f-61ab-4901-abd9-60dad4f945b0)

**Screen 1 — "Talk to our team"**

- `Status of this transfer` as a subtitle, then the transaction itself pinned at the top
  (`To your SGD balance / Added / + 1 SGD`) so you never lose what this is about.
- `Conversation language` — a select.
- `Your preferred option` — three rows, icon + label + chevron: **Chat · Phone · Email**.
  Channels are offered as a list, not as buttons.

**Screen 2 — "Request a phone call"**

- Headline, then one plain sentence: _"We'll call you to your phone and connect you to the
  right person."_
- The transaction context **repeated again**.
- Phone number field with a country-code select.
- `Get ready for your call` → `Your membership number: •••••` and
  _"The person calling you might ask for this number."_
- One full-width button: `Call me`.

**Screen 3 — the confirmation**

- A dark toast: _"We are connecting you to the right person. When your phone rings, please
  answer it."_

### [IHG — contact us](https://mobbin.com/flows/a666c330-2e16-405f-9eea-13aaf92e349f)

- `Hi Alex, how can we help you?` — named, personal.
- `WE'RE HERE TO HELP 24/7` as a mono-ish label.
- `Text us` · **`Currently offline`** — availability stated in red next to the channel.
- `Ask our Digital Concierge ›`.

### The four mechanics

1. **Context travels.** Wise restates the transaction on every screen of the escalation.
   You always know which thing the call is about.
2. **Channels are rows, not buttons.** One button per screen; the choice of channel is a list.
3. **Availability is stated.** IHG says "Currently offline" rather than letting you write into
   a void.
4. **The confirmation says what happens next _and what you must do_.**
   Not "we'll call you" — _"when your phone rings, please answer it."_

---

## Pattern C — Flighty

Home → tap a row → the sheet rises to ~90%, the map shrinks to a sliver showing that route.
No commerce at all. Actions are a horizontally scrolling row of pill chips. Covered in
`design/reference-flighty.md`.

---

## What this means for BBC Club

Our loop is Pattern B wearing Pattern A's clothes: the detail screen **looks** like a
commerce detail, but the button does not transact — it signals interest and hands off to
Julia.

```
Proposals (feed)
   │  tap anywhere on the card or row — no chevron, no button
   ▼
Proposal detail
   hero photograph (12px bottom corners)  ← DESIGN.md
   title as an invitation
   two facts-mono lines
   price + price-published
   validity
   ─────────────────────────────────────
   anchored at the bottom: the price pair, and ONE button-primary
   "I'm interested"                       ← verb-first, not "Book now"
   │
   ▼
Responded
   the proposal is still on screen (context travels — Wise)
   "Julia will call you shortly."         ← DESIGN.md's line
   + what the member should do            ← the half Wise has and we do not
   │
   ▼
Inbox eventually carries the follow-up
```

### Three gaps this exposes

1. **The responded copy is incomplete.** `DESIGN.md` gives "Julia will call you shortly." —
   that states what happens, not what to do. Wise proves the second half matters:
   _"when your phone rings, please answer it."_ The same rule `DESIGN.md` already applies to
   errors ("say what happened and what to do next") should apply here.

2. **Availability is unhandled.** If Julia is not available, the app currently has nothing to
   say. IHG states it inline. Silence is worse than "Julia is away until Monday."

3. **There is no screen for the responded state.** `DESIGN.md` names it as one of the
   separate frames; it does not exist in code or in the playbook.

### What must not come across

| From                                                             | Why not                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Viator: heart, 4.8 ★, 970 Reviews, "Book ahead!"                 | No ratings, no hearts, no urgency                          |
| Viator: "Lowest Price Guarantee"                                 | A price claim; the club does not compete on price          |
| Expedia: breadcrumbs, OneKeyCash banner, "Non-refundable" in red | No loyalty currency; `status-danger` is for errors only    |
| Careem: "Save up to 35%"                                         | Percentages are forbidden; we show the price pair          |
| Booking: "Get a better room for just US$11.38 ›"                 | An upsell inside the thing you already agreed to           |
| All four: a coloured CTA (green, blue)                           | One `button-primary` in `#1E293B`; no accent colour exists |
