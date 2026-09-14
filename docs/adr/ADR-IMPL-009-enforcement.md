# ADR-IMPL-009 — Boundaries and rules are enforced by tooling, not by review

Status: accepted · Date: 2026-09-11
Decision: three tools, each for what it does best — `exports` maps (compiler visibility), dependency-cruiser (layers, cross-module, cycles), eslint-plugin-boundaries + custom rules (intra-module layering, memberId in request schemas, inline colors, testID, floating promises, env casts, forEach-async). `bun run validate` runs them cheapest-first and is the merge gate; `validate:quick` runs on pre-push; pre-commit = prettier + gitleaks. Tokens are generated from DESIGN.md and checked for drift. Modules are scaffolded with a failing contract test. CODEOWNERS protects contracts and platform. The module graph is regenerated in CI on main.
Consequences: a rule that is not encoded here does not exist; adding a rule = adding a check + a test that a violation fails.
