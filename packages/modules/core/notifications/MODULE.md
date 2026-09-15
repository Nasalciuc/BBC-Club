# core/notifications

**Owns:** schema `notifications.*` — notifications (inbox + push queue: category, status pending/sent/delivered/failed/suppressed, scheduled_for, read_at), device_tokens (platform, native_token, active).
**Publishes:** `notification.delivered`, `notification.failed` (noConsumer; analytics).
**Consumes:** `offer.published` → one row per targeted member (consent + quiet hours + 1 offer push/day, UNIQUE member+offer+category) · `offer.withdrawn` / `offer.expired` → suppress pending · `offer.responded` → transactional "Julia will call you shortly" · `member.deleted` → delete tokens + rows.
**Ports:** `PushSender.send(platform, token, payload)` (integration/push), `Members.timezoneOf/getStatus/activeMemberIds/preferencesOf`.
**Facade:** `inbox(actor)`, `unreadCount(actor)`, `markRead(actor, id)`.
**Jobs:** `dispatch` (poller-style loop: advisory lock via job singleton, SKIP LOCKED 100, ≤20/s, recheck status+prefs at send), `receipts` (sent without delivered > 24 h → receipt_unknown), `cleanup-devices` (inactive 180 d).
**Out of scope:** email/SMS channels, in-app chat, segment fan-out (campaigns; no cross-schema JOIN to offer_targets).
**Invariants tested:** dedupe by unique index · withdrawn offer → suppressed · dead token deactivated on Unregistered/BadDeviceToken · quiet hours with member timezone · transactional bypasses consent and quiet hours · mark-read is scoped (foreign row → 0) · payload contains no PII.
