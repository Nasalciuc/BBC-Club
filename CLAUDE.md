@AGENTS.md
@DESIGN.md
@design/components.md

Screens and copy from onboarding on follow DESIGN.md 3.0 and the images in `isolated/bbc-club-3.0-design/final/` (ADR-IMPL-055): where an image and DESIGN.md differ, DESIGN.md wins. The entry screens stay as they are (ADR-IMPL-047), on `src/constants/club.ts`. Follow the design system and UI rules in DESIGN.md otherwise; before creating or modifying UI, read the component in `packages/ui`, reuse tokens, and report any conflict between DESIGN.md, the images and code instead of resolving it silently. Validate with `bun run validate:quick` before proposing a PR.
