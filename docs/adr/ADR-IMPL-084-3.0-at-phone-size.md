# ADR-IMPL-084 — 3.0 at phone size: larger words, and rows, pills and fields to match

Status: proposed · Date: 2026-11-02 · Scope: `DESIGN.md` (Typography: every 3.0 role under 28 pt; Layout), the tokens,
`@bbc/ui` (ListRow's `profile` and `fare` looks, the request fields, Segmented, Stepper, Chip, Calendar, CabinCard, the
offer, popular, flight, request, trip and fare cards, the modal sheets' `request`, `question` and `delete` looks,
HomeSheet's pill, EmptyState's pills), the app (Profile, the fare page, the request sheet, the dates page, the
destination's and the request's pages, Received, onboarding, Settings, the message pages), `design/components.md` ·
Amends ADR-IMPL-057 (the reading scale) and ADR-IMPL-056 (the images' measures, where this table replaces them) ·
Owner's decision, 2 Nov 2026.

**Context.** ADR-IMPL-057 raised the images' type to reading sizes but kept their boxes, and the owner found the
screens still too small. A walk through the 65 screens and states from onboarding on (web build, 393 × 852 pt, the
staging demo's data), every line measured:

- **Profile:** 60 % of the words under 14 pt; rows 29.65 pt tall (Settings: 47); `Edit profile` and `Sign out` about 29 pt.
- **The request sheet and the dates page:** 65 % under 14 pt (the price 13.75); fields 37 pt; `Round trip` / `One way`
  24.8 pt; labels at 11–11.5 pt.
- **The fare page:** 45 % under 14 pt (`London` under its code 11.5, `Down from …` 13).
- **The destination:** `INDICATIVE FARE` and `LOCAL TIME` 11 pt; the codes 12.75.
- **Explore:** half the words under 14 pt (the globe's labels 12.25–12.75, the offer cards' lines).
- **Requests and a request:** `Round trip · 1 adult` 13 pt; the reference 11.25.

Settings, Edit profile, Search and the message pages were already at phone sizes (15–17 pt words, rows of 44 pt or
more). The owner chose (2 Nov 2026) **larger words and the rows, pills, fields and cards to match**, the screens no
longer matching the images' proportions.

**Decision.**

1. **A second step on the reading scale.** Every 3.0 role under 28 pt is raised once more along one curve (11 → 13,
   12 → 13.75, 13 → 14.75, 14 → 15.5, 15 → 16.25, 16 → 17, 18 → 18.75, 20 → 20.75, 24 → 24.75, 28 unchanged);
   letter spacing keeps its em value; line heights are multipliers and follow. **Nothing under 13 pt, 12 for tracked
   capitals** (DESIGN.md states the floor; `type-floor.test.ts` reads it). The globe's labels: `pin` 14.5,
   `pin-detail` 14, `route-pin` 13.75, `map-city` 13.4. A few roles are set where their screen needs it: Profile's rows
   16.5 and values 15.5 (Settings' scale), the request fields' values 16.5 and placeholders 15, the segments 16.
2. **Boxes at phone size.** Every changed value is listed below, and the code says so where it is set
   (`ADR-IMPL-084`):

   | Element                                    | Images' value (pt)  | New value (pt)                                                                                                          |
   | ------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
   | Primary pills                              | 29–45               | 50: `Request a quote` (06, 11, 13), `Request this fare`, `Use these dates`, `View request ›`, `Done`, the message pages |
   | Profile pills                              | ~29                 | 48: `Edit profile`, `Sign out`; Settings' `Sign out` 36 → 48                                                            |
   | Deletion and question pills                | 36.86 and 44.25     | 48 and 50; their sheets 353 → 400 and 228 → 234 tall                                                                    |
   | Search's `Clear search` and 17's pill      | —                   | 44 and 50                                                                                                               |
   | Profile's and the fare page's row cards    | 29.65–37            | 48, Settings' measures (icon 20, words from 52)                                                                         |
   | Request fields (06, 22, 23)                | 36.8–37.4, radius 5 | 54, radius 8; label on 21, value on 42; the pickers' icon column narrower, so `Nov 16, 2026` fits in half the width     |
   | Request sheet                              | 586                 | up to 740 tall, the content scrolling under the pill                                                                    |
   | `Round trip` / `One way`                   | 24.8                | 40, radius 8                                                                                                            |
   | Stepper pill                               | 104 × 33.2          | 124 × 40                                                                                                                |
   | Chips: trip, route, place / fare / filters | 31 / 26.8 / 31.7    | 36 / 34 / 38                                                                                                            |
   | Calendar days and circles                  | 29.1                | 36                                                                                                                      |
   | Fare cards: summary / overview / route     | 73 / 90 / 121       | 94 / 122 / 155, their lines re-spaced                                                                                   |
   | Offer cards (02, 16)                       | 121 wide            | 134 × 286 and 134 × 246 (`United Kingdom` on one line; the third card runs off the edge)                                |
   | Wide offer cards                           | —                   | lines 19–20 apart, so a two-line country pushes the rest down                                                           |
   | 08's compact fares                         | 117                 | 132 tall                                                                                                                |
   | Popular cards (03)                         | —                   | words 24 and 21 apart                                                                                                   |
   | Flight options (04, 13)                    | 61.4                | 78 tall                                                                                                                 |
   | Request cards (09)                         | —                   | route and days 28 and 24 apart; the days stop before the chevron                                                        |
   | Profile's trips                            | 89 × 135            | 120 × 150, their lines following one another                                                                            |
   | Profile's name and home line               | —                   | 66 and 24 down                                                                                                          |
   | Onboarding's two cabins                    | side by side        | one over the other, each line on one row                                                                                |

3. **Unchanged:**
   - The entry (`club.ts`, ADR-IMPL-047).
   - Colours, photographs, data and copy.
   - The order of every screen.
   - The 1.0 sheets (Name, Home airport, Notifications, Password), which were already at these sizes.

**Consequences.**

- The screens no longer match the images' measures; `design/components.md`'s numbers are the images', and this table
  replaces them where it lists a value.
- Parity shots and e2e flows see taller screens; the flows find elements by `testID`, not by position.
- Verified on the web build: every screen and state from onboarding on (the same 65 as the walk); no line under the
  floor (13 pt, 12 for tracked capitals), nothing cut, nothing wider than the screen.
