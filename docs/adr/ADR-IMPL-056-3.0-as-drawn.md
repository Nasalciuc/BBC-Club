# ADR-IMPL-056 — 3.0 as drawn: the images' own sizes, colours, photographs and data

Status: accepted · Date: 2026-10-19 · Scope: P1 (`DESIGN.md`, the tokens, `@bbc/ui`, every 3.0 screen, the catalog,
proposals, requests and members contracts) · Amends ADR-IMPL-055 §1, §3, §4, §7 and §8; keeps the rest of it (the
entry frozen in `club.ts`, the delivery in four pull requests). §2's type scale is amended by ADR-IMPL-057 (reading
sizes).

**Context.** ADR-IMPL-055 rebuilt the inside of the club from the 3.0 images but evened them out: one value per role
from the component sheets (a 20-pt gutter, a 52-pt pill, 16-pt body), sheet 37's eight hex colours, Inter, and the
elements the club had no data for left out (§7). The owner rejected the result: the screens must be the images "fix în
fix" — sizes, spacing and colours as drawn — every element the images show must be there and work, and the app must use
the design package's own artwork (#75: `isolated/bbc-club-3.0-design/final/`, its `assets/`, `assets/locked/`,
`design-contract.json`), never pictures of ours.

**Decision.**

1. **The screens are measured, not evened out.** Each of the 46 images (853 × 1844 px) is read as a 393 × 852-pt phone
   (2.1705 px/pt). Every text line was fitted to the app's face by its glyph height and stem, every box, radius, gap,
   colour and shadow measured from the pixels (the tools and the per-screen measurements are the reference; the
   component sheets' printed numbers are the generator's labels and do not lead). A component takes the values of the
   screen it belongs to; where two images draw the same component differently (the tab bar is 70 pt tall on one, 82 on
   another), the final screen it appears on most wins, and the states follow their screen (REFERENCE-SPEC: a state is
   its screen with only what the state needs changed). Content sits where the images put it on a 47-pt status bar; on
   a taller safe area it moves down with the inset.
2. **The type is Inter Tight** (`@expo-google-fonts/inter-tight`, 400/500/600/700). The images were drawn with an
   SF-like face about 8% narrower than Inter: at the glyph height the images show, Inter Tight sets the same width
   (median width ratio 0.998 over 95 lines; Inter 0.917, Roboto 0.975), so lines break where the images break them.
   The scale is the images' own (`DESIGN.md` · Typography): secondary lines are 10–13 pt, as drawn — smaller than the
   14-pt floor 3.0 set for body text. Dynamic Type still scales them (up to 1.3×).
3. **The colours are the images' pixels.** Pages are white, not off-white; navy text is #0A1B37 and navy fills #1D2D46
   (sheet 37 prints #1E293B, which no screen renders); the light badges and the `Save` pill are a light blue
   (#DBE8F9), the chips and fields a light grey (#EFF2F6), the information cards lighter still (#F5F7FA); slate is
   #5F6A7F; red is #EC0017 everywhere (the images' #F80018, one step darker so its words keep 4.5:1 on white); the
   dimmed page under a sheet is black at 62%. The weather mark keeps its yellow sun (`art-sun`), as approved; no other
   yellow, gold, orange or green appears.
4. **The design's artwork, never ours.** The photographs are the package's, by city and by place: a request card shows
   the request crop (Tokyo at dusk), an offer the offer crop (Mount Fuji), Search its own (`assets/locked/photos`), and
   the 3:2 photos elsewhere — copied unscaled into `apps/mobile/assets/images/club/` as WebP, each with its source and
   sha256 in `SOURCES.md` (`club-photos.ts`). Cities the design does not draw keep the server's place photos
   (ADR-IMPL-043); the dark-cabin picture is no longer a fallback inside the club (it stays the entry's). The airline
   marks (British Airways, Virgin Atlantic, American) are the locked crops. The glyphs that exist only as raster crops
   — Business's reclining seat, First's armchair, the family, the three filled active tabs, the weather mark, the
   received check — are traced from those pixels (`packages/ui/src/art-paths.ts`, potrace on the approved crop, the
   source's sha256 beside each), never redrawn from memory; the empty state of Requests is the package's complete
   illustration.
5. **Every element drawn is there, backed by data** (§7 of ADR-IMPL-055 is withdrawn):
   - a request's dates with the year (`Nov 12–19, 2026`, `requestDates(legs, { year: true })`) and the airline it was
     asked for (`RequestVM.carrier`, recorded from the fare like its published price);
   - a fare says what its price covers (`FareVM.trip`, from the catalogue's `trip`; `one way` until the catalogue says
     `round_trip`, so a price is never described as more than it buys);
   - a destination's line under its name (`AirportVM.description`, from the catalogue);
   - an offer's rating (`ProposalCardVM.rating`, set with the offer; no star without one);
   - the member's photo (`ProfileVM.avatarUrl`; the initials until there is one — the upload needs a native image
     picker and comes with 0.3.0);
   - the heart (05) and the bookmark (13) save a fare and a destination on the phone, and Profile counts them
     (`8 Saved`);
   - the fare's photographs after the city's — the business-class seat and the lounge — with the carousel's dots;
   - the profile button on the dates page (07), `See all` under the received request (08), the weather card (05) from
     the weather service (its provider and attribution are decided apart).
6. **Facts still stay facts** (ADR-IMPL-055 §8): `Save 48%` only where the published fare is on record, `round trip`
   only on a fare the catalogue sells round trip or an indicative estimate, no number the server does not send.

**Consequences.** `DESIGN.md` 3.0 carries the measured palette, the Inter Tight scale and the components' geometry;
`design/components.md` the anatomy at those values. Four expand-only migrations (requests carrier, catalog fare trip and
airport description, proposals offer rating, members avatar URL); the contracts' new fields are optional both ways, so
apps and servers of either age read each other. The app grows by about 3.4 MB of photographs.
