# intelligence/personalization (stage 5)

**Owns:** schema `personalization.*` — member_features (nightly), member_scores (v2), proposal_candidates (suggested/accepted/rejected/expired, reasons, ranker_version).
**Publishes:** `personalization.candidate_suggested` (operator surface, v2).
**Consumes:** `member.deleted` → wipe `member_features` + `proposal_candidates`, then tombstone the journal (last consumer so siblings still see the payload). Ranker consumers (`crm.mirror.synced`, `offer.viewed`) remain out of scope.
**Ports:** none in v1 (reads its own tables; features built from journal + crm facade `mirrorFor(memberId)`).
**Facade:** `redactMember(tx, memberId)` (account deletion). Ranker (`rank`, `contextLines`, `suggestCandidates`) is stage 5.
**Jobs:** `nightly-features`, `generate-candidates` (not registered in this branch).
**Out of scope:** auto-publishing to members (agent decides), online inference (v2 = batch scores table), any model in the request path.
**Invariants tested:** `member.deleted` leaves zero `member_features` and `proposal_candidates` for that member · candidate accepted ⇒ published_offer_id set (CHECK).
