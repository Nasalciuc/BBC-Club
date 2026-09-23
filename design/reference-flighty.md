# Flighty — deep reference

Everything below was read off Mobbin screens, not from memory. Flighty is the structural
reference for the Proposals home screen; this file records how the whole app is built, so
we borrow the mechanism rather than the surface.

Flows: [Adding a flight](https://mobbin.com/flows/cb376bea-e4c7-4d9e-91d8-d0b493ec370d) ·
[Adding a flight detail](https://mobbin.com/flows/48a61650-6d90-4897-b723-a0c25ea6b2cc)

---

## 1. The whole app is one composition

Every screen is the same two things: **a map layer that fills the screen, and a white sheet
over it.** Only the sheet height and the map camera change. There is no second layout.

| Screen                      | Sheet top        | What the map shows                                      |
| --------------------------- | ---------------- | ------------------------------------------------------- |
| My Flights, empty           | ~40%             | The whole globe, Asia-Pacific in view                   |
| My Flights, one flight      | ~40%             | Zoomed to California, the SFO→LAX route drawn in blue   |
| My Flights, several flights | ~40%             | Zoomed out to Europe, all routes drawn as arcs          |
| Add Flight                  | ~10% (near full) | Blurred behind                                          |
| Flight detail               | ~55–90%          | A sliver, showing that flight's route with airport pins |
| Passport                    | ~40%             | The globe again                                         |

### The thing I had wrong

**The globe is not a backdrop. It is a live map bound to the content.** Add SFO→LAX and it
flies to California and draws that line. Open a flight and it shows that flight. On the
home screen with many flights it shows all of them at once, labelled.

That is why Flighty can spend 40% of the screen on it. It is the primary view; the sheet is
the index.

---

## 2. The globe layer, in detail

From the home screen with routes:

- Photorealistic 3D Earth, day side rendered in satellite imagery (green land, blue ocean,
  white ice over Greenland), night side dark with amber city lights. A real terminator.
- **Labels are map labels**, in a hierarchy:
  - `EUROPE` — white, letterspaced caps, largest — continent
  - _Greenland Sea_, _Norwegian Sea_, _Barents Sea_ — pale blue italic — water
  - `London`, `Paris`, `Berlin`, `Madrid`, `Rome`, `Stockholm`, `Moscow`, `Istanbul` — white,
    small, each with a hollow ring marker — cities
- **Route arcs**: pale blue (~#5B9BD5), curved, with a filled dot at each endpoint,
  running off the edges of the frame.
- Floating controls, top right, dark translucent glass: a stacked rounded rectangle holding
  a map icon and a cloud (weather) icon, and below it a separate circle with a globe/pin icon.
  On the flight detail map these become: a collapse icon, cloud, and a locate arrow.

---

## 3. The sheet

- Pure white, **large top radius (~32px)**, full width, no side inset.
- Header row, always the same shape: **big bold title on the left** (`My Flights`,
  `Passport`, ~34px, heavy sans), and on the right **two circular controls** — a light grey
  circle with a share glyph, and a circular avatar photo.
- Content begins below the header with no divider.

---

## 4. The list rows (home)

The rhythm is a **wide left gutter holding one large number**:

```
 1      [airline mark] DL 1421              Mon, Jun 29
DAY     San Francisco to Los Angeles
        ↗ SFO 10:15 AM     ↘ LAX 11:40 AM
────────────────────────────────────────────────
        21h 34m at LAX                  Long Layover
────────────────────────────────────────────────
 2      [airline mark] CX 7786             Tue, Jun 30
DAYS    Los Angeles to Mexico City
        ↗ LAX 9:14 AM      ↘ MEX 2:00 PM
```

- The numeral is ~34px bold; `DAY` / `DAYS` beneath it in tiny grey caps. It is **time until
  departure**, not an index.
- The route line is the loudest text in the row: bold ~20px, city names, not codes.
- Airport codes sit in the annotation line with small circled ↗ / ↘ glyphs, times in medium.
- Layover rows sit between flights, indented past the gutter, with their own hairlines.

---

## 5. The flight detail — the densest screen

Header, inside the sheet:

- `AA 6294 • FRI, 26 JUN` — small, grey, with the airline mark inline.
- `San Francisco to Los Angeles` — bold ~24px, wrapping to two lines.
- A circular `×` top right.
- **A horizontally scrolling row of pill chips**: `Alternatives`, `Live Activity`,
  `Open In Maps` — or, when not subscribed, `Get PRO`, `Share`, `My Flight ⌄`, `Alte…`.

Status banner, full width, grey ground:

- `Gate Departure in 7h 35m` bold, then an explanation line and a chevron.
- Or, when something changed: `Departure changed to 10:15 AM` / `Flight now departs 1h 20m later`.

**The times block — the app's signature:**

```
↗ SFO • San Francisco Intl. ›                    ┌──────────┐
                                                 │ ↗  B22   │   yellow chip
6:00 AM                                          └──────────┘
On Time · Departs in 7h 35m                       Terminal 1

    ⏱  1h 42m • 544 km          ← thin connector, centred

↘ LAX • Los Angeles Intl. ›                      ┌──────┐┌────────┐
                                                 │ T4C3 ││ ↘ 52G  │
7:42 AM  7̶:̶4̶3̶ ̶A̶M̶                                └──────┘└────────┘
1m Early · Arrives in 9h 17m                      Terminal 4
```

- The time is **~40px**, and its colour carries the status: green = on time or early,
  black = merely scheduled.
- A superseded time appears **struck through, small, immediately after** the live one.
  (Exactly the mechanic of our price pair.)
- Yellow chips carry gate and baggage belt. Terminal sits under them in grey.
- The connector line between the two blocks holds duration and distance.

Below that, in order:

1. `Enable popular features:` → a card with an illustration, `Calendar Sync`, a paragraph,
   and a purple `ENABLE` button.
2. Two cards side by side: `Booking Code` with a `PASTE` chip, `Seat` — both `Tap to Edit`.
3. `Good to Know` — a list of quiet rows, each an icon plus two lines:
   `SFO › Normal Operations` (green dot), `Departure Delays / Flights are taking off 0m late
on average`, `Departure Weather / 15°C and broken clouds`, then the same three for arrival,
   then `No Timezone Change / Both airports are in the same timezone`.
4. A **floating bottom toolbar**: a white pill holding share, bell, `•••` on the left, and a
   purple `Get Pro` pill on the right.

### Editing sheet

`Booking Details` — a plain modal with `Done` top right. Fields (`ABC123`, `15A`) then
**chip groups** for choices: Aisle / Middle / Window / Pilot / Captain / Jumpseat,
then Class (Economy / Premium Economy / Business / First Class / Private), then Reason
(Personal / Business / Crew). Every chip carries a small icon.

---

## 6. Passport (the stats tab)

- A **skeuomorphic passport card**: navy border, a world map with red route arcs and pins,
  a row of flag emoji, `MY FLIGHTY PASSPORT`, and a monospace MRZ strip at the bottom
  (`ALLTIME<<ALEX<SMITH<<MEMBER26JUN26<<@FLIGHTY…`). Below it a `Blacklight` toggle and
  Messages / Photos / More share targets.
- A **purple gradient stat card**: `FLIGHTS`, `DISTANCE`, `FLIGHT TIME`, `AIRPORTS`,
  `AIRLINES` in a two-column grid, with `All Flight Stats ›` at the bottom.
- Deeper in: `Countries & Territories` / **`14`** `total`, then flag rows with counts, then
  a grid of region tiles each with a count and a percentage.
- `Flight Time` / **`169`**h **`25`**m.

**The number treatment, used everywhere:** the figure is huge and black, the unit is small
and grey, set immediately after it on the same baseline. `169`h`25`m. `14` `total`.

---

## 7. Empty states

`Let's Fly Somewhere` / `Tap 🔍 Search to add your next flight` — centred, grey, inside the
sheet. No illustration, no button, no spinner. The copy points at the tab bar.

---

## 8. Colour

| Colour               | Means                                              |
| -------------------- | -------------------------------------------------- |
| Green                | On time, early, normal operations                  |
| Yellow / amber chips | Gate, terminal, baggage belt                       |
| Purple               | Pro. Every monetisation surface, without exception |
| Blue                 | Active tab, route arcs, links                      |
| Red                  | Airline marks only                                 |

**Colour is the status system.** On the detail screen there are three separate Pro
surfaces — the banner, the `Get Pro` pill, and the `ENABLE` button — all purple, all
instantly readable as "this costs money".

---

## 9. Tab bar

A **floating frosted pill**, inset from the edges, holding `My Flights` / `Friends` /
`Passport` with icon above label, plus a **separate circular search button** to its right.
Content scrolls visibly behind and beneath it.

---

## What BBC Club takes

1. **One composition for the whole app** — a background layer and a sheet whose height is
   the only variable. Cheap to build, and it makes every screen feel like one place.
2. **The sheet header shape** — big title left, the person top right.
3. **The left-gutter rhythm in list rows.** Ours holds the square photograph
   (`proposal-row` in `components.md`) where Flighty holds the numeral.
4. **The superseded-value mechanic** — live value large, superseded value struck through and
   small, immediately after. This is exactly `price` + `price-published`, and Flighty proves
   it reads at a glance.
5. **The number-plus-unit treatment** — a candidate for the price pair and for flight facts.
6. **The empty state register** — one centred grey line, no illustration, no button.

## What BBC Club must not take

| Flighty                                           | Why not                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Colour as the status system (green/yellow/purple) | `DESIGN.md`: "the palette has no semantic hues to rely on"; nothing may be communicated by colour alone |
| Three Pro surfaces on one screen                  | No upsells anywhere; the advisor is not a sales badge                                                   |
| Map labels, city names, `EUROPE`                  | No text on photography                                                                                  |
| The skeuomorphic passport, flags, MRZ strip       | No brand pastiche; the club is not a game                                                               |
| Gamified stats, percentages, `Show More`          | No metrics, no counts as content                                                                        |
| The search FAB and the search field in Add Flight | No search anywhere in the product                                                                       |
| The floating frosted pill tab bar                 | `components.md`: no pills, no highlight bars                                                            |
| Chip groups for choices (Aisle/Window/Business/…) | Members do not configure anything; the advisor does                                                     |

## The decision this forces

Flighty earns 40% of the screen for its globe because the globe **is the view** — it is
bound to the content and changes with it. Ours is a still photograph behind an index.

So either:

- **(a)** the globe becomes live — it moves to the destination of the proposal in view, and
  earns its space; or
- **(b)** it shrinks to a header image, or is replaced by the proposal's own photograph.

Copying the 40% without copying the binding is the one mistake this reference invites.
