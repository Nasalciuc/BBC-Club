# Stitch prompt — BBC Club home screen ("Proposals")

Token-checked against `apps/mobile/src/constants/club.ts` and `design/components.md`.
Values marked ⚑ are open product decisions — see "Open questions" at the bottom.

---

Design a mobile home screen for BBC Club, a private members' app for a business-class
flight concierge. iPhone 15 Pro frame, 393 × 852, light mode. Members are business
travellers aged 45+, mostly American; the app is a quiet channel between them and their
personal advisor, Julia — not a marketplace. No search bar, no discount badges, no
countdowns, no loyalty points, no "trending".

## Layout — three layers, top to bottom

1. **Background** — a photographic globe fills the top 40% of the screen. Earth seen from
   space, night side with soft city lights, centred on the North Atlantic so both the US
   East Coast and Western Europe are visible. Deep navy space `#1E293B` around it. No
   labels, no routes, no pins. Status bar in light text.
2. **Light card** rising over the globe from ~38% of the height to the bottom. Background
   `#F8FAFC`, top corners 24px radius, horizontal padding 24px. Everything below lives
   inside this card.
3. **Tab bar** pinned to the bottom. Background `#F8FAFC`, 1px top border `#E2E8F0`. Three
   items, JetBrains Mono Medium 9px uppercase, letter-spacing 1px, each above an 18px
   thin line icon (1.5px stroke): PROPOSALS (active, `#1E293B`) · INBOX (`#64748B`, with a
   6px dot in `#1E293B` at its top-right) · PROFILE (`#64748B`).

## Inside the card, in this order

**a. Advisor row** — full width, background `#1E293B`, radius 12, padding 12px vertical /
16px horizontal. Left: a 32px rounded square (radius 12) in `#F8FAFC` with "JR" in a serif
face, 16px, `#1E293B`. ⚑ Middle: "Julia Reed" Inter Medium 15 `#F8FAFC`, under it
"Your advisor" Inter 13 `#94A3B8`. Right: "Call" as a plain text link, Inter Medium 15
`#F8FAFC` — no border, no filled shape. ⚑

**b. Title block** — "Proposals" in Newsreader 400, 28px, `#1E293B`. Under it
"8 proposals this week" Inter 13 `#64748B`.

**c. Section label** — "FOR YOU" JetBrains Mono Medium 11 uppercase `#64748B`,
letter-spacing 1.5px.

**d. Featured proposal card** — white, 1px border `#E2E8F0`, radius 12, overflow hidden.

- Top: a 16:9 photograph — London seen from inside a taxi at first light, autumn,
  rain on the glass, the street beyond dissolved and empty. No people. Muted cinematic
  grade, deep shadows, restrained warm light.
- Body, padding 16px:
  - "Your October in London" Newsreader 400, 20px, `#1E293B`
  - "You flew this route in March." Inter 15 `#64748B`
  - "JFK → LHR · BUSINESS" JetBrains Mono 12 `#64748B`, letter-spacing 1px
  - "NONSTOP · 7H 05 · LIE-FLAT SUITE" same style
  - Price row: "$4,200" Inter Medium 15 `#1E293B`, then "$7,850" struck through,
    Inter 13 `#94A3B8` — real price first, published price after
  - "Valid until 4 October" Inter 13 `#94A3B8`
- No button, no chevron; the whole card is the tap target.

**e. Section label** — "FROM THE CLUB", same style as c.

**f. Horizontal carousel** ⚑ of two-and-a-half visible cards, each 180 × 120, radius 12.
Full-bleed photograph with a scrim over the bottom 45%, title in Newsreader 400, 16px
`#F8FAFC`, and beneath it the price in Inter Medium 13 `#F8FAFC`:

- "Autumn in Paris" — $3,850 — an empty Paris apartment interior at dusk, tall shuttered
  window half open, parquet, long shadows. No people, no street.
- "Tokyo before the holidays" — $4,650 — a quiet hotel room high above Tokyo at night,
  low wooden desk, city reduced to a muted amber haze beyond the glass. No neon, no street.
- A third card partially visible.

**g. Footer** — "Curated by Julia." centred, Inter 13 `#94A3B8`, 24px above the tab bar.
Roman, not italic.

## Type and colour

- **Serif** Newsreader 400 — titles only. Sizes: 34 / 28 / 20 / 16.
- **Sans** Inter 400 and 500 — body. Sizes: 17 / 15 / 13. Never below 15 for real content.
- **Mono** JetBrains Mono — labels 11 (ls 1.5), flight facts 12 (ls 1), tab bar 9 (ls 1).
- **Palette, complete — nothing outside it:** `#1E293B` primary, space, text primary ·
  `#334155` photo placeholders only · `#64748B` text secondary · `#94A3B8` text tertiary ·
  `#E2E8F0` the single hairline · `#F8FAFC` page, text on dark · `#FFFFFF` cards.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 only.
- Radii: 4 badges · 12 cards, fields, thumbnails · 24 panel top corners · pill buttons only.
- No gradients except the photo scrims. No shadows anywhere.

## Mood

Calm, editorial, expensive. A hotel concierge's note, not a travel deals app. Generous
whitespace; one dominant element (the London card); the globe is atmosphere, not a feature.

## Second variant — the empty state

Same globe, same advisor row, same "Proposals" title. In place of c–f: a single centred
line in Newsreader 400, 20px, `#64748B` — "Julia is preparing your first proposals."
Nothing else. Footer unchanged. No spinner, no illustration.

---

## Open questions (⚑)

1. **Monogram inversion.** `components.md` specifies the monogram as `action-primary`
   (`#1E293B`) with serif initials in `text-on-dark` — which disappears on a navy row.
   This prompt inverts it (light square, navy initials). Either the inversion is adopted
   into `components.md`, or the advisor row stops being navy.
2. **"Call" as text link.** `DESIGN.md` forbids buttons inside cards, so the outlined
   button became a text link. If a stronger affordance is wanted, the action belongs
   outside the row.
3. **The carousel.** `DESIGN.md` says single column, phones only, and defines
   `proposal-row` as the secondary form. The carousel is a new component; prices were
   added so the club offers are not left priceless.
4. **The globe.** A third world alongside entry (photograph) and inside (`surface-page`).
   Approved as atmosphere; revisit at Stage 5 when real routes exist to draw.
5. **Serif divergence.** This prompt specifies Newsreader per `DESIGN.md`; the app
   currently renders `SourceSerif4` (TODO in `club.ts`). The image will not match the build.
6. **Untokenized components.** `price`, `price-published` and `badge-for-you` appear in
   `components.md` but have no tokens in `club.ts`. Sizes above are provisional.
   `badge-for-you` is omitted here because the "FOR YOU" section label carries its job —
   that overlap needs resolving.
