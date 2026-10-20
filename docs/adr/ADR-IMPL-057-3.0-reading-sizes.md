# ADR-IMPL-057 — 3.0 at reading sizes: the images' type raised, the cities and the portraits that were missing

Status: accepted · Date: 2026-10-20 · Scope: P1 (`DESIGN.md` · Typography, the tokens, `@bbc/ui`, Explore, the fare
and destination pages, the request sheet, Profile; `HomeVM` in `packages/shared`, `/v1/home`) · Amends ADR-IMPL-056 §2
(the images' own scale); keeps the rest of it.

**Context.** ADR-IMPL-056 set every line at the size its image draws. On the owner's phone, with main running against a
local API and no data of ours, the inside reads small: the images draw secondary lines at 7–13 pt. Measured on main
(web harness, 393 × 852 pt): the request sheet's smallest line is 6.9 pt and its fields 8.6–8.7 pt; the fare page's
chips 10.2 pt, `Down from …` 9.7, the cities under the codes 9.4, the days 9.1; Profile's trip days 8 pt, the stats'
names 10.3, the rows 12.3; the Requests cards' `Round trip · 1 adult` 9.7; an offer card's price 10.8 and `from` 9.8;
the cabin's line on onboarding 9.5. `DESIGN.md` had said body text never goes under 14. The owner asked for the text to
be larger throughout. The same walk found two things the screens drew and main did not show: a member the club has no
name for (one who joined by email) had an empty navy disc for a portrait, and an offer whose city no pin of the
member's home airport lists printed its title cut short (`Autumn in P…`) instead of its city and country.

**Decision.**

1. **One reading scale for every 3.0 role.** Each typography role is the image's size raised along one monotonic curve
   (`DESIGN.md` · Typography): nothing under 12 pt (11 for tracked capitals), small lines grow most (9 → 12.5,
   10 → 13.2, 11 → 14, 12.3 → 14.8, 14.5 → 16.2, 16 → 17.2, 20 → 20.5), roles from 28 pt unchanged. Tracking keeps its
   em value (tracked capitals 15% tighter); line heights are multipliers and follow. The globe's labels stay compact
   (`pin` 12.75, `pin-detail` 12.25, `route-pin` 12, `map-city` 11.5) so more of them keep their room. The entry keeps
   `club.ts`; nothing here reaches it.
2. **Columns give way, words are not cut.** Where a drawn column cannot hold a line at its reading size: the estimate's
   note stops at the local time's rule and wraps, and the zone wraps inside the card (13, 04; 04's column moves to 266
   pt in, as 13's sits); the flight overview's arrival moves to 282 pt in (05); the route map's labels get 76 pt and
   their own line pitch (05); the request sheet's trip card flows under its rule — the days and clocks beside the
   fare's own column — and grows with them (06); Profile's trips are three to the width (12) and a long range takes a
   second line, as does a long country on a wide offer card (16). The globe's label boxes are sized from the roles'
   sizes, not from 02's character widths.
3. **A portrait for everyone.** The avatar shows the member's initials, and the person glyph when the club has no name
   for them; the monogram stays under a photo, so a photo that is loading or cannot load still shows a portrait.
4. **An offer names its city.** `/v1/home` adds `places`: the city and country of each offer arrival that `destinations`
   does not list, from the airports reference already read for the regions. `HomeVM.places` is optional both ways — an
   older server sends none and the card keeps the title as before. The offer card reads the city from the pins first,
   then from `places`.

**Not in this ADR.** The images' rating, weather, city description, member photo, `Keep the dates flexible` and offline
caches need data or the owner's decision; broadcast offers shown to members of another home airport with that airport's
prices is a product decision. The onboarding card stays empty until the member chooses (ADR-IMPL-039: the time zone's
airport is offered, never chosen).

**Consequences.** The screens no longer match the images' type pixel for pixel; their layout, colours, photographs and
data still do. Parity shots change. A role changed by hand afterwards keeps to the curve's floor.
