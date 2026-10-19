# Rules for this isolated visual handoff

Read README.md, IMPLEMENTATION-CONTRACT.md, REFERENCE-SPEC.md and design-contract.json before changing these assets.
Use assets/locked/catalog.json to identify exact source artwork and whether it is image, static-image or reference-only.
Never regenerate an existing approved visual, substitute stock imagery, invent content, or change the base style.
Keep Business and First icons distinct. Use the same Daniel avatar and the context-specific city photos.
Do not embed screenshots of interactive controls as application UI. Use existing @bbc/ui tokens and accessible native components.
Pinned SVGs are library geometry, not exact raster traces; resolve mismatches against the source screen, never silently replace a glyph.
Do not touch or import into application packages in this task. All changes stay in this isolated folder.
If required artwork or authoritative tokens are missing, report the gap rather than guessing.

