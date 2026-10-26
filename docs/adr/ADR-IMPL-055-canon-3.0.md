# ADR-IMPL-055 — Canon 3.0: the club in daylight, the entry kept as it is

Status: accepted · Date: 2026-10-19 · Scope: P1 (`DESIGN.md`, the tokens and their generator, `@bbc/ui`, every screen
from onboarding on, the agents' files) · Replaces, for the inside of the club, `DESIGN.md` 1.0, the type of
ADR-IMPL-041 and the components of ADR-IMPL-046; keeps ADR-IMPL-046 and ADR-IMPL-047 for the entry.

**Context.** The owner's direction for 3.0: the entry (Welcome, Sign in, Join, Verify, Set password, Reset) stays
exactly as it is; everything from onboarding on is rebuilt in a new design. The design was made as 46 images — 13
screens the owner chose on 19 Oct 2026, 23 states and 8 component sheets — merged in #74 under
`isolated/bbc-club-3.0-design/final/`. `DESIGN.md` 1.0 contradicts them almost everywhere: one bronze accent, serif
headlines, no shadows, no search, filters, ratings or hearts, one filled button with neither icon nor arrow, no
percentage chips. AGENTS.md rule 9 asks an ADR to change `DESIGN.md`.

**Decision.**

1. **Where the inside's truth lives.** `DESIGN.md` 3.0, whose values come from the component sheets (37–44) and the
   screens; the images show every screen and state. The Figma file `nYP9gogb6hnpKxfpKiCc4g` keeps 1.0 and no longer
   leads inside. The images are generated and do not always agree with one another — the gutter is 15 to 26 pt, a pill
   34 to 54 pt high, a card's dates 12 pt on one screen and 16 on the next — so `DESIGN.md` picks one value for each
   (a 20-pt gutter, a 52-pt pill …) and the screens follow it.
2. **The entry is frozen in code, not by habit.** `apps/mobile/src/constants/club.ts` holds its colours, spacing,
   radii, type roles and motion, written by hand with the values 1.0 generated; `ClubButton`, `ClubIcon` and
   `AnimatedEntrance` read only it, and `club.test.ts` pins every value (its literals are allowed beside `club.ts` in
   `eslint.config.mjs`). A change to the entry is a change to that test. Until the screenshot gate (PR-4) exists, this
   is the entry's guard.
3. **The palette** is sheet 37's eight colours — white, off-white, navy, slate, light tint, light navy, pale sky, red —
   with two steps that keep the words readable: `status-danger-text` (#DC2626) for red words and the filled `Delete
account` pill (sheet 37's #EF4444 gives white or red words 3.76:1, under the 4.5:1 `DESIGN.md` asks), and
   `text-on-tint` (#475569) for words on the light tint (slate gives 4.34:1 there). The drawn globe has imagery colours
   of its own (`globe-*`), never used on UI.
4. **Type.** Inter (400, 500, 600, 700 — `@expo-google-fonts/inter`, already a dependency) inside; no serif. Prices take
   tabular figures (`fontFeature: 'tnum'`, generated as `fontVariant`). `rn()` no longer passes a `fontWeight`: each
   weight is a family of its own, and a weight on top would make Android and the web embolden a font already bold. The
   globe's labels have two 13-pt roles of their own (`pin`, `pin-detail`): a city and its price must fit beside a pin
   (02). The entry keeps its Fraunces, Geist and Geist Mono.
5. **Elevation.** Cards, sheets and the round buttons over photographs have soft shadows (sheet 37): the club's own
   `elevation` group in the front matter, generated as React Native `boxShadow` (New Architecture). `design:lint`
   reports the group as ignored by its exports — one accepted warning.
6. **Components** follow sheets 38–42 in `@bbc/ui` (`design/components.md`). Still one filled navy pill per screen; it
   may now carry an icon before its words or an arrow after them. Badges name five states, `Closed` included: 1.0 gave
   a closed request no badge, so that it would never be taken for an open one; the word `Closed` now does that job, as
   the owner's images show it.
7. **No number the club does not have.** The images show things the app has no data for; the app leaves each out until
   it has it, and shows the rest:
   - left out: the rating (★ 4.8), the saved count and the hearts and bookmarks that save (nothing stores them), the
     weather, the member's photo (their initials until an upload exists — it needs a native image picker and a new
     build), a city's description, the cabin and lounge photos of the fare's carousel, an airline's logo where the fare
     has none (its name instead);
   - shown, from data the club has: the greeting with the member's name, a city's country, `Save 48%` where the
     published fare is on record (its FTC evidence), flight times and durations, the local time, the status filters,
     `My trips`, `Other great fares`, the route map (drawn from the land data the globe uses), share (the phone's own
     sheet).
8. **Facts stay facts.** A fare is one flight, one way, and its price says `one way`; `round trip` belongs only to an
   indicative fare (`EstimateVM.trip`). `Get better fares if your travel dates can be flexible.` promises a price the
   club cannot promise: the calendar keeps `Your specialist confirms availability.` until the company confirms it.
9. **Where the images contradict the app's logic, the code wins.** A closed request (33) offers neither `We will call`
   nor `Call your specialist`; a request's call follows its status as before (30, 31). Settings (34) is reached from
   Profile by a round settings button over its photograph: the privacy policy must stay reachable in the app (App Store
   guideline 5.1.1), and Profile's rows do not carry it.
10. **Delivery.** Four pull requests, merged in order: the canon and the library; Explore, onboarding, search and the
    destination; the fare, the request, the dates and the confirmation; Requests, a request, Profile and Settings. They
    reach phones as one OTA update on 0.2.0 — no native module is added. `.easignore` keeps `isolated/` (74 MB of
    images, in git since #74) out of EAS uploads.

**Not in this ADR.** Saving fares (a server change, the owner's call), a weather provider, the member's photo (0.3.0),
the entry's screenshot gate (PR-4, ADR-IMPL-049).

**Consequences.** `DESIGN.md`, `design/components.md` and `design/motion.md` describe 3.0; AGENTS.md and CLAUDE.md say
the inside follows `DESIGN.md` 3.0 and the images, the entry `club.ts`. Screens still on 1.0 read the 3.0 tokens through
a mechanical rename until their pull request rebuilds them.
