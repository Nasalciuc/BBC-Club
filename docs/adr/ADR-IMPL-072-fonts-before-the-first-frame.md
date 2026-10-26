# ADR-IMPL-072 — The cold start waits for its fonts behind the splash; the type floor is DESIGN.md's; a zone under its other names

Status: proposed · Date: 2026-10-26 · Scope: `apps/mobile` (the root layout, `components/font-gate.tsx`,
`lib/font-gate-logic.ts`, `constants/fonts.ts`, `app.json`'s `expo-font` entry, `lib/zone-match.ts`, `nearFirst` in
`lib/airport-search-state.ts`), a test in `packages/ui` (`type-floor.test.ts`). No server change; `DESIGN.md` is not
edited. Amends the root layout of f26870c (the 23 Sep white screen) without undoing it.

**Context.**

- **Welcome in the system font (brief 4.1.4).** Since f26870c the root layout mounts the Stack at once and hides the
  splash on the first paint, so a session that never answers cannot leave a white screen. It also stopped waiting for
  `useFonts`. React Native lays a text out once, in the font it has at that moment, and does not lay it out again when
  the font is registered later. On a cold start Welcome is laid out in the first frame, before `useFonts` has even
  asked for the files, and stays in the system font (Android). The comment that said "fonts swap in when ready" was
  wrong.
- **The fonts loaded were not the fonts drawn.** `useFonts` loaded fourteen names. The screens draw nine: Inter Tight
  400, 500, 600 and 700 (`rn()` maps every 3.0 role to one of them) and the entry's Fraunces 400, Geist 400 and 500,
  Geist Mono 400 and 500 (`constants/club.ts`). Material Symbols (944 KB), Fraunces 600 and the aliases `Fraunces`,
  `Geist` and `Geist Mono` were loaded and drawn nowhere (no `fontFamily` in `apps/mobile/src` or `packages/ui/src`
  names them).
- **The type floor (brief 4.1.5).** The brief says DESIGN.md's body floor is 14 and asks to raise the 75 roles under
  it. DESIGN.md 3.0 says otherwise: the reading scale (ADR-IMPL-057) puts "nothing under 12 pt (11 for tracked capitals
  such as `INDICATIVE FARE`)" and keeps the globe's labels compact (`pin` 12.75, `pin-detail` 12.25, `route-pin` 12,
  `map-city` 11.5). DESIGN.md wins (CLAUDE.md) and is rule-9 gated, so the 75 roles stay as they are.
- **The suggestion and Ho Chi Minh City (brief 4.1.6).** The home airport offered at onboarding is the server's
  (`GET /v1/airports/home-suggestion`, `homeSuggestion` in the catalogue's `discovery.ts`). In a zone where several
  cities tie on popularity, it offers the zone's own city. It finds that city by the zone's name: `Asia/Ho_Chi_Minh` is
  `ho chi minh`, but the catalogue's city is `Ho Chi Minh City`. Vietnam's six busiest airports tie (CXR, DAD, HUI,
  PQC, SGN, VCA), so no airport is offered. The app's own use of the zone is the order of onboarding's search (14,
  `nearFirst`: the phone's zone first). It compared the names exactly. Android reports ICU's names (`Asia/Saigon`,
  `Asia/Calcutta`, `America/Buenos_Aires`) and the catalogue uses the current IANA ones (`Asia/Ho_Chi_Minh`,
  `Asia/Kolkata`, `America/Argentina/Buenos_Aires`), so a phone in Vietnam never saw SGN first.

**Decision.**

1. **The screens wait for the fonts, at most 3 s, behind the splash.** `lib/font-gate-logic.ts` holds the decision
   and its tests. The gate opens when the fonts are in, a font failed, or `FONT_WAIT_CAP_MS` (3 000 ms) passed. It reads
   nothing else: no session, no network. `components/font-gate.tsx`'s `useFontGate` loads the fonts and starts the cap.
   It hides the splash (`SplashScreen.hide()`, SDK 57) when the gate opens. The splash is still kept up from module
   scope (`preventAutoHideAsync`). The Stack mounts at once, as f26870c made it. Only each screen's content waits: the
   root Stack's `screenLayout` (React Navigation 7, through Expo Router's Stack) wraps every screen in `FontGate`,
   which renders it once a context says the gate is open. Welcome's text is therefore laid out first in the club's
   fonts. After a cap or an error it is laid out in the system font, and the app goes on. The gate never closes again.
2. **One list of fonts, loaded and embedded.** `constants/fonts.ts` names the nine families and their files.
   `useFontGate` loads exactly those (`satisfies Record<ClubFontFamily, number>`: a missing or an extra family does
   not compile). `app.json` embeds the same files through `expo-font`'s config plugin, `android.fonts`. On Android an
   embedded font's family is its file's name, and every file is named as its family (`InterTight_400Regular.ttf`).
   `constants/fonts.test.ts` checks four things: the list holds every family `club.ts` uses and Inter Tight at every
   weight the tokens use; each file's name is its family; each file resolves from the app as the plugin resolves it;
   and `app.json` lists exactly these files. `expo-font` is already a direct dependency (`~57.0.3`, 57.0.4 installed,
   SDK 57's `bundledNativeModules.json` says `~57.0.4`).
3. **Not on iOS yet.** iOS names an embedded font by the family inside the file (`Inter Tight`), not by the file's name
   the styles use. Embedding there would add the files without serving the first frame, and there is no iOS build yet
   (brief D4: no Apple account). iOS keeps loading at runtime behind the same gate.
4. **The type floor is DESIGN.md's, and a test keeps it.** `packages/ui/src/type-floor.test.ts` reads the floor from
   DESIGN.md's own sentence (12, and 11 for tracked capitals) and the globe labels' sizes from the next one. It checks
   every generated role: words at 12 or more; the seven tracked-capitals roles at 11 or more with a positive
   tracking, listed by name and only while they are under 12; the four globe labels at exactly the sizes DESIGN.md
   names. If DESIGN.md's floor changes, the test enforces the new one at once.
5. **A zone under its other names.** `lib/zone-match.ts` holds the catalogue's `ZONE_ALIASES` (the names a phone may
   report, mapped to the current IANA name). `zone-match.test.ts` reads the catalogue's file and fails if the two
   tables differ. `inZone` decides by the airport's own zone where the catalogue gives one, under either name. Where
   it gives none (an older server, or a zone the runtime cannot format), it decides by the airport's city against the
   zone's city. Both are compared without accents, punctuation or a trailing `city`: `Ho Chi Minh City` and
   `Ho_Chi_Minh` are both `ho chi minh`. `nearFirst` uses it. The tests use the catalogue's own rows
   (`seeds/airports-reference.tsv`), never made-up airports: SGN for `Asia/Ho_Chi_Minh` and `Asia/Saigon`; CCU, KTM,
   RGN, EZE, GOH, IND and SDF under Android's names; GUA, KWI, PTY, YYT and NRT by city.

**Measured (2026-10-26, this branch).**

- Type roles: 268 in all. 75 are under 14 and 8 are under 12: `label` 11.25, `routeLabel` 11, `routeTimeLabel` 11,
  `placeLabel` 11, `placeTimeLabel` 11, `datesEyebrow` 11, `receivedTripLabel` 11, `mapCity` 11.5. The 75 split into
  seven tracked capitals, four globe labels (`pin`, `pinDetail`, `routePin`, `mapCity`) and 64 roles for words between
  12 and 13.75 (`profileRow` 13.25, `profileValue` 13, `statLabel` 13.5 among them).
- Every use of the seven tracked-capitals roles was read, and all set capitals. **No violation of DESIGN.md's floor.**
  - `label`: `components/system-screen.tsx:26` (`BUYBUSINESSCLASS`); `app/request/[id].tsx:548` (`REF` and the
    reference, `R-` and eight capitals from `submit.ts:143`); `PricePair.tsx:35,41,59,71` (`YOUR FARE`, the source
    `.toUpperCase()`); `SectionLabel.tsx:31,35` (`.toUpperCase()`); `ErrorState.tsx:59` (`REF …`; no caller passes a
    reference today).
  - `routeLabel`, `placeLabel`: `DestinationDetails.tsx:589` (`INDICATIVE FARE`).
  - `routeTimeLabel`, `placeTimeLabel`: `DestinationDetails.tsx:356` (`LOCAL TIME`).
  - `datesEyebrow`: `DatesPage.tsx:193`, from `dates-page-logic.ts:8–9` (`.toUpperCase()`).
  - `receivedTripLabel`: `TripCards.tsx:353`, given `BUSINESS CLASS` or `FIRST CLASS` (`request/confirmed.tsx:384`,
    the gallery).
  - `mapCity` is the route map's city label (`FarePage.tsx:509`), a label DESIGN.md names.
- Zones, against the club's 3 860 reference airports (369 zones):
  - Android's names (ICU, 445): 352 found an airport before, 369 now. The 17 gained are `Asmera`, `Buenos_Aires`,
    `Catamarca`, `Coral_Harbour`, `Cordoba`, `Godthab`, `Indianapolis`, `Jujuy`, `Louisville`, `Mendoza`,
    `Calcutta`, `Katmandu`, `Rangoon`, `Saigon`, `Faeroe`, `Ponape` and `Truk`.
  - Every name a phone may report (ICU's, the table's old names and the catalogue's own; 538 in all): 369 → 462.
  - By city, for an airport sent without its zone: 287 zones → 299 (Guatemala, Belize, Panama, Ho Chi Minh, Djibouti,
    Kuwait, N'Djamena, St Kitts, St Lucia, St Thomas, St John's, Dawson).
  - The server's suggestion, simulated on the same rows with the same comparison as its tie-break: 350 zones → 351
    (`Asia/Ho_Chi_Minh` and `Asia/Saigon` → SGN). 18 still offer nothing, as ADR-IMPL-039 intends: a tie between
    other cities.
- Production config (`EXPO_PUBLIC_APP_ENV=production npx expo config --type public --json`, with made-up URLs and a
  made-up `pk.` token) differs before and after only by the `expo-font` plugin entry. `--type prebuild` also adds
  `expo-font` to `_internal.pluginHistory`. `version` (0.2.0) and `runtimeVersion` (`appVersion`) are unchanged.

**What reaches phones, and when.**

- **An OTA update to today's 0.2.0 binaries** carries decisions 1, 2 (the list loaded) and 5. Those binaries embed no
  fonts. The update's JavaScript loads the nine files at runtime, as before, and the splash now waits for them, at
  most 3 s. The `app.json` entry does nothing to an installed binary. Welcome gets its fonts on the first cold start
  after the update.
- **The next native build** (a preview APK, or the native release of brief D4) copies the nine files into
  `android/app/src/main/assets/fonts/` at prebuild. The first frame then already has them under the names the styles
  use. `useFonts` still registers the same files, which is harmless, so the gate opens as soon as the load resolves.
  The embedded files are not a native module: nothing in the JavaScript needs them. A build with them can share
  runtime 0.2.0 with the builds without them, and needs no `version` bump of its own.
- e2e builds read `app.json` too, so CI's Android e2e build exercises the plugin at prebuild.

**Alternatives.**

- **Return `null` from the root layout until the fonts load** (the SDK 57 splash-screen guide's pattern). Rejected: the
  root must keep its navigator (f26870c), and Expo Router's first navigations (the session gate's `replace`, a launch
  link) need it mounted.
- **Re-key the Stack when the fonts arrive.** Rejected: it remounts the navigator and loses its state.
- **Gate only the entry's screens.** Every screen draws custom fonts, and a cold start can land on a deep link. The
  gate is a pass-through once open, so gating all of them costs nothing afterwards.
- **Embed only, and drop runtime loading.** Rejected: today's binaries and the web have no embedded fonts, and an OTA
  update must still work on them.
- **Raise the 64 word roles to 14** as the brief asks. Rejected here: DESIGN.md says 12 and is rule-9 gated (Left to
  the owner).
- **Fix the suggestion's tie-break in the app**, by searching the zone's city when the server offers nothing. Rejected:
  it would offer a city ADR-IMPL-039 says not to guess (a tie between other cities). The tie-break belongs to the
  server's PR.

**Consequences.**

- A cold start shows the splash until the fonts are in. That is their load time, usually a fraction of a second, and
  never more than 3 s. On the web, with no splash, the page shows its background for that time.
- The forced-update and maintenance pages (`AppGate`) replace the Stack and sit outside the gate. They need the
  server's answer first, which in practice comes after the fonts.
- Two copies of `ZONE_ALIASES` exist, the catalogue's and the app's. A test keeps them equal. One copy in
  `packages/shared` would need an ADR under rule 9 and the server's import; it is left for the server's PR.
- The catalogue gives some Vietnamese airports `Asia/Bangkok` (HAN, HPH, VII, VDO, VDH, DIN, THD). A phone in Hanoi
  (`Asia/Ho_Chi_Minh`) therefore lists SGN, not HAN, first. That is reference data (ADR-IMPL-036), kept as it is here.

**Left to the owner (not decided here).**

- **14 or 12.** The brief's floor (body never under 14) and DESIGN.md 3.0's (nothing under 12, 11 for tracked
  capitals, ADR-IMPL-057) disagree. This change keeps DESIGN.md's and pins it. If the owner wants 14, DESIGN.md's
  sentence and the front matter of the 64 word roles change together, with an ADR (rule 9). Most images draw these
  lines at 9–11.5 pt, so many drawn columns would wrap. The test then enforces 14 without edits.
- **The native build that embeds the fonts.** Run `cd apps/mobile && eas build --profile preview --platform android`
  for a preview APK, or the D4 native release. Nothing in this change needs it to work.
- **The phone check of the cold start.** Done by the owner; the app is never run here. See the PR's checklist.
- **The suggestion's tie-break** (catalogue `discovery.ts`, `homeSuggestion` and `zoneCity`). It should compare cities
  as `cityKey` does: no accents, no punctuation, no trailing `city`. That fixes Vietnam (measured above) and is the
  server's PR.
