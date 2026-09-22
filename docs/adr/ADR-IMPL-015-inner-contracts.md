# ADR-IMPL-015 — Inner contracts: typed fares/home + ProfileVM

Status: accepted · Date: 2026-09-22 · Supersedes nothing; amends ADR-IMPL-011 (flight contracts). `packages/shared` is ADR-gated.

**Context.** After typed facades (#34), contracts still leaked: `HomeVM` / `SearchResultVM` used `z.any()` for carousel items and route offers; the mobile app hand-wrote a `Profile` type that the API never declared. Columns `member_since` and `linked_at` existed in Postgres but not on `ProfileRow`.

**Decision.**

1. `SearchResultVM.offer` and `HomeVM.sections[].items` are `ProposalCardVM` (nullable / array). No `z.any()` under `packages/shared/src/api/v1/`.
2. New `packages/shared/src/api/v1/profile.ts` exports `ProfileVM` and `TravelPreferencesVM`. Status includes `pending` for the no-row BFF stub. Only `memberSince` is nullable among the date fields — justified by that stub; other stub fields get defaults (`timezone`, `crmLinked: false`, `preferences: {}`).
3. Members facade exposes `memberSince` and `crmLinkedAt` (`linkedAt`). The BFF maps through `toProfileVM` and returns a parseable `ProfileVM` on every GET `/v1/profile`.
4. Mobile imports `ProfileVM as Profile`; the hand-written type is deleted.

**Consequence.** Contract shape is checked at the boundary. Recurrence of `z.any()` in v1 contracts is caught by G12 (`any in contracts` must be `{}`). Honest-app may tighten `memberSince` to required once pending profiles always have a row.
