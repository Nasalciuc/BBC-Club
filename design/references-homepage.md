# Home screen — the two approved references

The visual direction for the Proposals home screen comes from two screens, approved by Betty.
This file records what was actually observed in them, what we take, and what we deliberately
change. Companion to `design/stitch-prompt-homepage.md` (the build spec) and `DESIGN.md` (canon).

---

## Reference A — Flighty, home

<https://mobbin.com/screens/6baa59c6-7b40-41da-a1ca-e49bb110a100>

**This is the structural reference.** Three layers, and the reason the composition works.

### Layer 1 — the globe (~top 40%)

- Photorealistic 3D Earth, full bleed, curving out of frame on both sides. Black space with
  faint stars above the limb.
- Night side rendered with **city lights** — Europe reads as a field of warm amber points.
  Ocean deep blue, Greenland ice white, terminator visible.
- **The globe carries information.** Labelled and drawn on:
  - Water bodies in light-blue italics: _Greenland Sea_, _Barents Sea_, _Norwegian Sea_
  - Cities as a small ring + white label: Stockholm, Moscow, London, Berlin, Paris, Rome,
    Istanbul, Madrid
  - `EUROPE` in white letterspaced caps, larger — a continent-scale label
  - **Route arcs** in pale blue, curving between city dots, running off both edges
- Floating controls top-right: two dark translucent rounded rectangles stacked (map icon,
  cloud icon), and a separate dark circle below (globe/pin). Glassy, light icons.

### Layer 2 — the white sheet

- Starts at ~40% height, pure white, **large top radius (~32px)**, full width.
- `My Flights` — heavy sans, ~34px, black, top-left.
- Top-right of the sheet: a light circular share button and a circular avatar photo.
- **Purple PRO banner** — rounded ~14px, saturated violet, a lighter `PRO` pill, a white
  semibold line with a chevron, a muted second line, and an `×` to dismiss. _This is an
  upsell._
- Flight rows use a **large left-gutter numeral**: `1` at ~34px bold with `DAY` beneath it in
  tiny grey caps, then the flight block to its right — airline mark + flight number, right-
  aligned date, a bold ~20px "San Francisco to Los Angeles", then `SFO 10:15 AM` /
  `LAX 11:40 AM` with small circular arrow markers.
- A hairline, then a layover line: `21h 34m at LAX` left, `Long Layover` right.

### Layer 3 — the tab bar

- A **floating pill**, white and frosted, not a bar welded to the screen edge. Content is
  visible, blurred, behind and beneath it.
- Three items with icon above label (My Flights active in blue, Friends, Passport), plus a
  **separate circular search button** sitting to the right of the pill.

### What we take

1. The three-layer composition — globe / rising sheet / tab bar. This is the whole reason
   the reference was chosen.
2. The large top radius on the sheet (ours is `radius.panel` = 24).
3. The sheet scrolls and the globe scrolls away with it.
4. The idea of a **large left-gutter numeral** as rhythm — a candidate for our flight facts.

### What we change

| Flighty                                    | BBC Club                           | Why                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Labels, city names, `EUROPE` on the globe  | **No labels, no pins**             | `DESIGN.md`: no text on photography                                                                                                                             |
| Route arcs drawn on the globe              | **None until Stage 5**             | We have no route history to draw yet; an empty globe is atmosphere, a drawn one is content                                                                      |
| Globe at ~40%                              | **~32%**                           | Measured: at 40% the dominant card falls below the fold                                                                                                         |
| Purple PRO upsell banner                   | **Nothing in that slot**           | This is the origin of our navy "advisor row". An upsell banner is the "sales badge" `DESIGN.md` forbids — we kept the position and the colour, not the function |
| Floating frosted pill tab bar + search FAB | **Flat bar, hairline top, no FAB** | `components.md`: no pills, no highlight bars; and no search anywhere in the product                                                                             |
| Heavy sans `My Flights`                    | **Serif `Proposals`**              | Every headline is serif at weight 400                                                                                                                           |
| Circular avatar                            | **Rounded-square monogram**        | No circular crops                                                                                                                                               |

---

## Reference B — World of Hyatt, "Offers To Inspire"

<https://mobbin.com/screens/9ca7bc65-9ada-40b6-9192-43ba4552d8b8>

**This is the geometry reference for the club rail — and nothing else.**

### Anatomy

- Light page. Top bar: brand mark left; `MEMBER · 0` and a circular account icon right.
- A rounded search field, grey fill: "Where can we take you?"
- A dark navy card with world-map artwork and a chevron — "Expand your horizons…"
- **Section header**: `Offers To Inspire` bold ~22px black, left; `See All` blue link, right.
- **Horizontal carousel**:
  - Cards roughly 2:1, wide enough that only one and a sliver of the next are visible.
  - White card, hairline border, ~12px radius.
  - Photograph on top, full card width.
  - Below it: a **letterspaced serif in caps** — `EARN 2X POINTS AT MR & MRS SMITH HOTELS`
  - Then a body paragraph, truncated with an ellipsis.
- Below: `Travel More. Earn More`, then a bordered white card with a huge `60K` numeral,
  `BONUS POINTS`, a credit-card image, and a `Learn More` link.
- Five-item tab bar with icon-above-label, Home active in blue.

### What we take

1. **Card width and the peek.** One card plus a sliver of the next — that sliver is what says
   "scroll me" without a chevron or a dot indicator.
2. The section header sitting directly above the rail.
3. Photography large enough to be the point of the card.

### What we reject — all of it content, not form

| Hyatt                                                           | Why                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Search bar                                                      | `DESIGN.md`: no search                                                      |
| `MEMBER · 0`, points balance                                    | No loyalty points in this product                                           |
| `See All` link                                                  | We show what the advisor curated, not a catalogue                           |
| Every card being a promo (`EARN 2X POINTS`, `60K BONUS POINTS`) | These are exactly the "urgency devices" and sales badges the system forbids |
| Body paragraph truncated with an ellipsis                       | Our rail cards carry a title and a price, nothing else                      |
| Letterspaced caps serif as a card title                         | Our serif is sentence case at weight 400; mono carries letterspaced caps    |

**The trap:** the Hyatt carousel _form_ arrived in our wireframe carrying the loyalty-promo
_content_ with it — cards with no price, titles reading like offers. Borrow the geometry;
write the content from the fixture.

---

## Net: what the home screen becomes

```
+- globe, ~32%, no labels, no routes -------+   <- Flighty layer 1, stripped
|                                           |
+- sheet, surface-page, radius.panel top ---+   <- Flighty layer 2
|  advisor line + hairline                  |   <- replaces the PRO banner slot
|  Proposals (serif 28)                     |
|  FOR YOU                                  |
|  the dominant card: photograph IS the     |   <- CLEAR / Careem, not Hyatt
|  card, serif title on the scrim,          |
|  facts + price pair in a strip below      |
|  FROM THE CLUB                            |
|  rail: wide cards, next one peeking       |   <- Hyatt geometry, our content
|  Curated by Julia.                        |
+- tab bar, flat, hairline top -------------+   <- Flighty layer 3, de-pilled
+-------------------------------------------+
```

## Open, still

- The globe is 32% of the screen and carries no information. Flighty's earns its space because
  it draws _your_ flights. Revisit at Stage 5, or replace it with the London photograph.
- Content still overflows the fold by ~316px. The rail is the likeliest thing to cut.
- All photography is placeholder until the plates are generated.

## Other references already vetted

| App                | Screen                                                            | What it settles                                                                           |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| CLEAR              | <https://mobbin.com/screens/335cc870-52bd-4532-a3b3-0e5237ac5960> | Serif route type over a photograph, on navy                                               |
| Careem             | <https://mobbin.com/screens/5dd98988-53d0-4f5e-9400-11dd4e64ec0c> | The photograph **is** the card — no white body strip                                      |
| Eight Sleep        | <https://mobbin.com/screens/e88bd8c4-cabe-4c32-9ee0-d461ba40f128> | Empty-state register: dark plate, short line, no button                                   |
| Doji               | <https://mobbin.com/screens/0e688189-28a6-4771-8def-29bd9f5b409c> | Waitlist register, and that a waiting member still needs an exit                          |
| CRED               | <https://mobbin.com/screens/65037a59-77d3-4428-97d4-d846071a0762> | Price pair order: real price first, published price struck after                          |
| Singapore Airlines | <https://mobbin.com/screens/1e153ba4-120b-4699-92f9-01cba90bfe56> | Hierarchy over a photo: destination large, class small, fare discreet                     |
| Mozi               | <https://mobbin.com/screens/3c07e1f1-fe80-4a54-ab6d-8c2014ee0d74> | Naming a person as presence — the advisor line                                            |
| Shangri-La Circle  | <https://mobbin.com/screens/483108b4-5990-4ebf-8ecf-62121722a2fe> | **Rejected.** Claimed as a private-club reference; it is a points programme with a mascot |
