# 50 additional airline logos

Downloaded 2026-10-19. These 50 are additional to the existing British Airways, Virgin Atlantic and American Airlines reference crops: 53 unique airline identities in total.

- svg/: 50 original vector files; no AI generation, recoloring or redrawing.
- png/: 50 transparent 320 × 96 exports; artwork fitted inside 288 × 64, aspect ratio preserved. These are logo boxes, not square icons.
- preview/: labeled white-background preview tiles, not runtime assets.
- contact-sheet.png: overview of all 50 airlines.
- index.html: local browsable gallery.
- catalog.json: airline name, IATA, source website metadata, pinned SVG source URL, byte counts and SHA-256 hashes.
- SOURCE-LICENSE.txt: upstream collection license.
- prepare.py: reproducible asset download/conversion script; requires existing Python and ImageMagick. Does not install anything.

## Provenance

Source: [Soaring Symbols](https://github.com/soaring-symbols/soaring-symbols/tree/2e97859ed3e7aba051d5696ff59c97c3de36823b), revision 2e97859ed3e7aba051d5696ff59c97c3de36823b. This is a third-party curated collection, not direct official airline downloads. File integrity, SVG structure, PNG dimensions and the contact sheet were checked; current brand-guideline compliance was not independently certified for every airline. Logo marks remain associated with their respective owners; the upstream project license does not transfer trademark ownership.

Thai Airways was considered but no full logo.svg was available in this pinned source. Riyadh Air was selected instead; no placeholder was invented.

Keep original brand colors. Do not apply the navy-only interface palette to airline logos. SVG is the editable master. Reference crops in assets/locked/airlines remain unchanged.

No app imports, source changes, build, tests or install. Saved in the isolated design folder and prepared for a future GitHub commit/push.
