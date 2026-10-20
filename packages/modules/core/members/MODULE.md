# core/members

**Owns:** schema `members.*` — profile (member_id = auth user id, crm_client_id opaque, status active/waitlist/deleted, timezone, preferences, avatar_url), notification_preferences.
**Photo** (ADR-IMPL-056, 0033): `profile.avatar_url` is the member's photo as Explore's greeting (02) and Profile (12) show it — the https address of an image hosted elsewhere, never the image (CHECK `avatar_url ~ '^https://'`); null, and the app shows the member's initials, until one is added. Stored and read only: no route writes it yet (an upload needs a native image picker, ADR-IMPL-055 §7), `PATCH /v1/profile` does not take it, and it goes with the profile on `member.deleted`. `getProfile` and `ProfileVM.avatarUrl` carry it.
**Publishes:** `member.linked_to_crm`, `member.profile_updated`.
**Consumes:** `member.registered` → create profile + match crm mirror by normalized email (`active` if matched, `waitlist` if not — ADR-PROD-001; `members.allow_non_crm_signups` stays off in v1); `member.deleted` → hard-delete profile + preferences; `crm.mirror.synced` → link waitlist members whose email appeared.
**Ports:** `CrmLookup.findByEmail` (integration/crm).
**Facade:** `getProfile(actor)`, `updateProfile(actor, patch)`, `setPreferences(actor, prefs)`, `getStatus(memberId)`, `timezoneOf(memberId)`, `activeMemberIds()`, `audiencePage({ category, after, limit })` (campaign fan-out: active members who accept the category, keyset on member id, one query per page), `preferencesOf(memberId)` (for notifications dispatch).
**Jobs:** `reconcile-profiles` (nightly: auth users without profile → re-emit member.registered), `purge-deleted` (hard-delete 7 days after deleted_at).
**Out of scope:** tiers/loyalty levels (field reserved), operator edits (v2).
**Invariants tested:** registered→profile exactly once (duplicate delivery → one row) · linked ⇔ crm_client_id present (CHECK) · a photo is an https address or none (CHECK), read by the profile, never written by a profile patch · transactional preference cannot be disabled (CHECK) · delete cascade zero rows · reconcile re-emits only when profile missing.
