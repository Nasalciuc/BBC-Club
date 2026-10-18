@AGENTS.md
@DESIGN.md
@design/components.md

Screens and copy follow the Figma file (`nYP9gogb6hnpKxfpKiCc4g`): where DESIGN.md contradicts Figma, Figma wins, except what the owner approved (ADR-IMPL-046); the entry screens stay as they are (ADR-IMPL-047). Follow the design system and UI rules in DESIGN.md otherwise; before creating or modifying UI, read the component in `packages/ui`, reuse tokens, and report any conflict between DESIGN.md, Figma and code instead of resolving it silently. Validate with `bun run validate:quick` before proposing a PR.
