# DESIGN — Spacing and icons (addendum to DESIGN.md)

**Date:** 16 Sep 2026 · **References:** Tesla Robotaxi (search field, category circles, row anatomy), FocusFlight (airport code pill, two-line rows), Fly Delta (56 pt rows, circle icons), Slopes/Tabby (trailing chevrons, badge rows)

## 1. The grid — 8 pt, no exceptions

| Token                                                                     | pt  | Use                                                            |
| ------------------------------------------------------------------------- | --- | -------------------------------------------------------------- |
| `space.xs`                                                                | 4   | between an icon and its label; badge padding                   |
| `space.sm`                                                                | 8   | between lines inside a row; carousel card gap is 12 (1.5 × sm) |
| `space.md`                                                                | 12  | inside cards; between a section label and its content          |
| `space.lg`                                                                | 16  | row horizontal padding; between rows in a list                 |
| `space.xl`                                                                | 24  | **the gutter** — every screen edge; above a section label      |
| `space.2xl`                                                               | 32  | between sections                                               |
| `space.3xl`                                                               | 48  | above the footer; empty-state breathing room                   |
| Nothing is 10, 14, 18 or 20. If a value is not in the table, it is wrong. |

## 2. Touch targets and heights

| Element                                                                                 | Height                                        | Notes                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| search field                                                                            | **56**                                        | radius 16; leading icon 20; text 16; padding 16; clear button 24 |
| primary button                                                                          | 56                                            | radius 14; text 16 medium                                        |
| secondary / outline button                                                              | 44                                            | radius 10; text 14                                               |
| list row (one line)                                                                     | 56                                            | leading 40-circle or 24-icon; chevron 16 trailing                |
| list row (two lines)                                                                    | **72**                                        | title 16 + subtitle 13, 4 apart                                  |
| fare row                                                                                | **80**                                        | three lines of information; price block right                    |
| airport row (autocomplete)                                                              | 64                                            | code pill left, city + airport name                              |
| tab bar                                                                                 | 56 + safe area                                | icon 24 above label 11 mono; active #0F172A, inactive #94A3B8    |
| sheet handle                                                                            | 36 × 4, radius 2, #CBD5E1, 12 above, 16 below |
| chip (filters)                                                                          | 36                                            | radius 18; text 13; padding 8 × 14                               |
| Minimum tap target **44 × 44** on anything interactive — `hitSlop` on small text links. |

## 3. Icons — one set, one weight, one size per context

- **Source:** `expo-symbols` → SF Symbols (iOS) / Material Symbols (Android) via the `{ ios, android }` object. Weight **regular**, never bold or fill unless the state is "selected".
- **Sizes:** 20 inside rows and fields · 24 in the tab bar and category circles · 16 for chevrons and badges. Never 18, never 22.
- **Colour:** `textSecondary` (#64748B) by default; `textPrimary` when selected; never a brand accent — colour is for state only.
- **Category circles** (Tesla pattern, for filters like cabin/date/passengers): 56 pt circle, `surfacePanel` fill, icon 24, label 11 mono uppercase 8 below.

| Meaning                                                                                                | iOS (SF Symbol)        | Android (Material)  |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------- |
| search                                                                                                 | `magnifyingglass`      | `search`            |
| departure                                                                                              | `airplane.departure`   | `flight_takeoff`    |
| arrival                                                                                                | `airplane.arrival`     | `flight_land`       |
| dates                                                                                                  | `calendar`             | `calendar_month`    |
| passengers                                                                                             | `person.2`             | `group`             |
| cabin                                                                                                  | `chair.lounge`         | `airline_seat_flat` |
| nonstop                                                                                                | `arrow.right`          | `arrow_forward`     |
| clear field                                                                                            | `xmark.circle.fill`    | `cancel`            |
| chevron                                                                                                | `chevron.right`        | `chevron_right`     |
| call                                                                                                   | `phone`                | `call`              |
| inbox                                                                                                  | `tray`                 | `inbox`             |
| profile                                                                                                | `person.crop.circle`   | `account_circle`    |
| explore (tab)                                                                                          | `globe.americas`       | `public`            |
| offer badge                                                                                            | none — text badge only | —                   |
| Flags (country) are **not icons** — they are 20 × 14 images, only in the airport row, never elsewhere. |

## 4. Component anatomy — the four that carry the home screen

### SearchField (56)

`[ 16 ][ 🔍 20 ][ 12 ][ placeholder 16 / #94A3B8 …………… ][ ✕ 24 ][ 16 ]`
Background #FFFFFF, border 1 px #E2E8F0, radius 16. Focused: border #1E293B. Filled state shows the route as
`[ JFK → ] London · LHR` where `JFK →` is mono 12 #64748B and the destination is Inter 16 #0F172A.

### AirportRow (64) — autocomplete results (FocusFlight)

`[ 16 ][ ✈ LHR pill ][ 12 ][ London / London Heathrow ][ … ][ 16 ]`
Pill: mono 12 uppercase, 1 px border #94A3B8, radius 6, padding 4 × 8, icon 14 before the code. City Inter 16
#0F172A; airport name Inter 13 #64748B; the two lines 4 apart. Separator 1 px #E2E8F0 inset 16 from the left.

### FareRow (80) — the search result

```
[16][ BA ][12][ British Airways        Inter 15 #0F172A      ][  OFFER  ][16]
        40      nonstop · 7h 05        mono 12 #334155          $4,200
      circle    Lie-flat suite         Inter 13 #64748B         Inter 17 medium #0F172A
```

Leading: a 40 pt circle, `surfacePanel`, with the carrier code in mono 13. Trailing block right-aligned: the
`OFFER` badge (mono 10, #1E293B on #E2E8F0, radius 4, padding 2 × 6) when a promotion exists, the price
under it. Whole row is the target; no chevron (the price is the affordance). 16 between rows. Card style:
#FFFFFF, 1 px #E2E8F0, radius 12.

### OfferCard — carousel

180 × 120, radius 12, 12 gap, first card inset 24 (the gutter), last card peeks 40 pt so the carousel reads as
scrollable. Photo full-bleed, scrim `linear-gradient(transparent 40%, rgba(15,23,42,.72))`, title Newsreader 15
#F8FAFC bottom-left 12 in, price mono 12 #CBD5E1 under the title, 4 apart.

### SectionLabel

Mono 11 uppercase, letter-spacing 0.14em, #64748B. **24 above, 12 below.** Optional trailing "See all" Inter 13
#1E293B, same baseline, right-aligned to the gutter.

## 5. The sheet

- Handle 36 × 4, then the SearchField at **16** below the handle, then 24 to the first section label.
- Snap points: 35 % / 60 % / 100 %. At 60 %, exactly **three FareRows** fit under the field + chips; at 100 % the
  offer sections stack with 32 between them.
- Sheet background #F8FAFC, top radius 24, no border, no shadow (the globe's darkness gives the edge).
- Filter chips row (dates · cabin · passengers): 36 tall, 8 gap, 12 below the field.

## 6. Density rules

- Never more than **two font sizes** in a row (title + supporting). The price is the exception, and it is the
  largest element in its row.
- A row has **one** trailing element: price, or chevron, or badge+price. Never chevron + price.
- Empty rows do not exist: no "—" placeholders; the row is omitted.
- Carousel shows **2.5 cards**; a full card plus a peek, never exactly 2.

## 7. What was wrong in the previous wireframes (so it is not repeated)

9–11 px text in fare rows (min is 13) · rows without fixed height · carousel cards at 66 pt (min 120) · search
field at ~40 pt (must be 56) · no leading icon in fare rows · section labels with 8 above instead of 24 ·
chevron and price in the same row · category icons as inline text glyphs instead of 20 pt symbols.
