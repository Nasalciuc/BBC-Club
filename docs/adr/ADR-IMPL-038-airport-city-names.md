# ADR-IMPL-038 — City names in the airport reference

Status: accepted · Date: 2026-10-08 · Follows ADR-IMPL-036

**Context.** The reference set (ADR-IMPL-036) took each airport's city from mwgg/Airports. Checked against OurAirports and
by hand, 746 of its 3,860 cities were not what a member expects to read: the town an airport sits in instead of the
city it serves (CVG "Hebron" for Cincinnati, EZE "Ezeiza" for Buenos Aires, MDE "Rionegro" for Medellín, XIY "Xianyang"
for Xi'an, NGO "Tokoname" for Nagoya, BOB "Motu Mute" for Bora Bora), misspellings ("Belgrad", "Larnarca",
"Bloemfontain"), missing marks ("Chisinau", "Malmo"), suffixes ("Bordeaux/Merignac", "Denpasar-Bali Island", "Jeju
City"), cities renamed decades ago ("Krasnovodsk", "Xiangfan"), and, on the curated hubs, names that disagree with the
curated seed ("Arnavutkoy" for Istanbul) — which a database without the curated seed, like production, would show.
Search found many of them through their search terms; what a member read did not match.

**Decision.**

- **The name a traveller books** — the city an airline prints for the airport: the city served, not the locality;
  islands and island countries by their own name where that is how they are sold (Bali, Maui, Mauritius, Malta, Koh
  Samui); English names where English has one (Rome, Florence, Naples, Venice, Turin, Genoa, Seville, Basel, Corfu); a
  city's current name (Aktobe, Turkmenbashi, Xiangyang, Zhangjiajie, Makassar, Utqiagvik).
- **Local spelling, with its marks, in Latin script** — the OurAirports spelling where it differs from ours only in
  marks or letter case (São Paulo, Malmö, Bodø, Łódź, Reykjavík, Montréal, Medellín); Romanian with comma-below letters
  (Chișinău, Iași, Timișoara, Brașov). Not where English drops the marks or OurAirports errs: Vietnamese tones (Hue,
  Van Don), Japanese macrons, Uyghur (Urumqi), "Panamá City", "Turkıstan", "Mazatlàn".
- **One city, no suffixes** — the first part of "City/Locality"; no "-Java Island"; no "City" where English does not use
  it (Davao, Taipei, Jeju); no "Island" after an island's own name (Mykonos, Tenerife), unless it belongs to the name
  (Christmas Island, Lord Howe Island, Hilton Head Island).
- **Curated airports agree with the curated seed** — the reference carries the curated city of all 80, so every
  database shows the same names whether or not the curated seed ran.
- **Left as they are, on purpose** — officially renamed Indian cities still widely written the old way (Bangalore,
  Cochin, Trivandrum, Allahabad), disputed places, and marketing names the reference already used (London for Luton,
  Brussels for Charleroi).
- **Every change in one reviewable file** — `seeds/airports-reference-fixes.tsv`: code, earlier city, corrected city,
  reason (accents, spelling, suffix, served, island, renamed, english, curated), names kept searchable. The reference
  TSV holds the corrected values; no other column changed.
- **Old names stay searchable where people use them** — the locality (Ezeiza, Dulles, Tocumen, Rionegro), the local or
  former name (Roma, Firenze, Ujung Pandang, Barrow), appended to the airport's search terms. Not misspellings (the
  typo-tolerant search covers them), not marks (`unaccent` maps ø, ł, ı, þ, ș, ț and ō — tested).
- **Existing databases** — `applyReferenceFixes`, in `migrate.ts` before the insert-only load, on every deploy. The city
  changes only on a row still exactly as the reference loader inserted it — the earlier city, the reference's name and
  coordinates — so a curated or imported row, which carries its own name and coordinates, keeps its city. Search terms
  always come from the reference (neither the curated seed nor the import writes them): a row's terms become the
  reference's while they are still the earlier ones, which the new ones extend; terms changed by hand stay. Idempotent;
  the trigger recomputes the search columns. One statement per 500 fixes; the log says `airports reference: N
corrected`. Cached searches may show an earlier name for up to a minute after a deploy.

**Measured.** A database loaded from the earlier reference, with the curated seed (staging's shape): 742 rows corrected
— 740 cities, plus the newer search terms on 2 curated rows — in 0.6 s; a second run changes nothing.

**Tests.** The fixes file: one line per airport, agreeing with the reference, "accents" changing only marks, kept
names at the end of the search terms; the curated cities; clean spelling (composed Unicode, no slash, no double space,
comma-below letters); named cases (CVG Cincinnati, EZE Buenos Aires, IST Istanbul, RMO Chișinău, BOB Bora Bora). On a
real database: nothing to do on a fresh one; all 746 rows of the earlier reference brought to the corrected one, city
and search terms, then nothing on a second run; a curated row keeps its city and gets the newer terms; an imported row
is untouched; hand-edited terms stay. Search: "Cincinnati", "bora bora", "bodo", "lodz", "Ezeiza".

**Rejected.** Correcting the upstream dataset and importing it again — slow, and its conventions would come back.
Overwriting existing rows with the reference — it would erase curated and imported values. A provenance column — a
migration for one correction, when name and coordinates already tell a reference row apart.
