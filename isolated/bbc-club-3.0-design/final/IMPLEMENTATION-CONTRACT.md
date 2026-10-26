# Implementation contract — BBC Club 3.0

This is a frozen visual handoff, not permission to redesign the app.

## Start here
1. Read REFERENCE-SPEC.md, design-contract.json and the relevant complete screen in screens/.
2. Open VISUAL-CATALOG.html locally to inspect every exported fragment and SVG.
3. Resolve each element by asset id in assets/locked/catalog.json. Check its usage field.
4. Use the context-specific photo. Search uses London, Paris and Tokyo with $3,900, $3,450 and $4,200. Never insert a seat photo for a city, change the city to Los Angeles/Amsterdam, or invent a different price.
5. Use the original Daniel avatar. Do not generate another person.
6. Rebuild interactive controls natively using existing @bbc/ui tokens/components and accessible semantics. Reference PNG controls are visual specimens only.
7. Compare the completed screen with the complete source at the same viewport before claiming visual fidelity.

## Asset classes
- image: a static source-pixel crop that may later be copied into the application. Preserve aspect ratio and existing background.
- static-image: original complete globe art with baked labels. Suitable for a static exact visual; it does not provide functional/accessible map controls.
- reference: a visual specimen. Never ship an entire button, field, card, tab bar, date picker or status text as a screenshot.
- icons-svg/: 29 existing Lucide line icons pinned to the installed library version, including the original license. They are vector implementations, not exact traces of generated glyphs. Match against the raster icon source. Do not use an outline icon for a filled active tab.
- icons-reference/: all 30 original icon-sheet glyphs, copied without scaling. Family is not silently mapped to users. Business reclining seat and First armchair stay distinct.

## Fixed content
design-contract.json contains the exact member, fares, airport codes, date ranges, airline options, statuses, local time, weather, photo assignments and tab rules.
REFERENCE-SPEC.md preserves the full requested copy and all 44 screen/state/component descriptions.
Do not infer prices from an unrelated card. Do not replace empty, error, offline or loading states with invented content. Rome appears only in the two specified request states.
The complete empty-state illustration already contains its pass details. Use assets/empty-state-illustration.png as one image; do not reconstruct its seat, window, globe, text or barcode.

## No fallback invention
If an asset id, native token, font, interactive state or component mapping is missing, name the gap. Do not fetch random stock, use one generic image everywhere, redraw a glyph from memory, add a different accent, change copy, or invent a numeric token.
Exact font sizes, radii and shadow constants must be taken from authoritative @bbc/ui tokens; numeric labels inferred in generated component sheets are not token definitions.
Source screenshots differ slightly in some motifs and photo crops. Keep their context-specific differences; do not silently unify them into a new style.

## Boundaries
All additions remain under isolated/bbc-club-3.0-design/final/.
Nothing here is imported into apps/mobile or an @bbc/* package.
Only explicitly selected artwork in assets/ may later be copied into application assets.
No application source, root rules, shared contracts, design-token source/output, dependency files or migrations are changed by this handoff.

## Reproducibility
tooling/export-regions.json records 117 source rectangles.
tooling/export-locked-assets.ps1 copies those source pixels without resizing or AI generation, checks sample pixels and writes hashes to assets/locked/catalog.json.
tooling/export-vector-icons.mjs exports existing installed Lucide geometry and writes the HTML gallery.
These are asset-export utilities; they do not install dependencies, build, test, or run the app.

