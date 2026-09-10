@AGENTS.md

# BBC Club — project instructions
Follow the design system and UI rules defined in @DESIGN.md.
Component anatomy and states: @design/components.md · Motion: @design/motion.md · Prompt patterns: @design/agent-prompts.md

Before creating or modifying UI:
1. Read the relevant component implementation in this repo.
2. Reuse existing components and tokens; never inline hex values or font sizes.
3. Check the responsive, accessibility and content rules in DESIGN.md.
4. Report any conflict between DESIGN.md and production code — do not resolve it silently.
5. Validate after editing DESIGN.md: `npx @google/design.md lint DESIGN.md`.
