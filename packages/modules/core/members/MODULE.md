# core/members

**Owns:** schema `members.*` — profile (member_id = auth user id, crm_client_id opaque, status active/waitlist/deleted, timezone, preferences), notification_preferences.
**Publishes:** `member.linked_to_crm`, `member.profile_updated`.
**Consumes:** `member.registered` → create profile + match crm mirror by normalized email (`active` if matched, `waitlist` if not — ADR-PROD-001; `members.allow_non_crm_signups` stays off in v1); `member.deleted` → hard-delete profile + preferences; `crm.mirror.synced` → link waitlist members whose email appeared.
**Ports:** `CrmLookup.findByEmail` (integration/crm).
**Facade:** `getProfile(actor)`, `updateProfile(actor, patch)`, `setPreferences(actor, prefs)`, `getStatus(memberId)`, `timezoneOf(memberId)` (for notifications).
**Jobs:** `reconcile-profiles` (nightly: auth users without profile → re-emit member.registered), `purge-deleted` (hard-delete 7 days after deleted_at).
**Out of scope:** tiers/loyalty levels (field reserved), operator edits (v2).
**Invariants tested:** registered→profile exactly once (duplicate delivery → one row) · linked ⇔ crm_client_id present (CHECK) · transactional preference cannot be disabled (CHECK) · delete cascade zero rows · reconcile re-emits only when profile missing.
