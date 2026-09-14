# intelligence/personalization (stage 5)

**Owns:** schema `personalization.*` — member_features (nightly), member_scores (v2), proposal_candidates (suggested/accepted/rejected/expired, reasons, ranker_version).
**Publishes:** `personalization.candidate_suggested` (operator surface, v2).
**Consumes:** `crm.mirror.synced` → recompute features for affected members · `offer.viewed` / `offer.responded` → update engagement features · `member.profile_updated` → preference features.
**Ports:** none in v1 (reads its own tables; features built from journal + crm facade `mirrorFor(memberId)`).
**Facade:** `rank(memberId, candidates) → scored[] with reasons`, `contextLines(memberId, offerIds)` (BFF, 300 ms budget, null on failure), `suggestCandidates(memberId)` (agent-in-loop).
**Jobs:** `nightly-features`, `generate-candidates`.
**Out of scope:** auto-publishing to members (agent decides), online inference (v2 = batch scores table), any model in the request path.
**Invariants tested:** rules ranker deterministic for same features · reasons never empty for score > 0 · killswitch → rank refuses, BFF falls back · candidate accepted ⇒ published_offer_id set (CHECK).
