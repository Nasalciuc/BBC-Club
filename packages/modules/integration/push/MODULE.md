# integration/push

**Owns:** nothing in the database (pure adapters).
**Publishes:** none.
**Consumes:** none.
**Ports (implements):** `PushSender.send({ platform, token, title, body, data }) → { ok, ticketId? } | { ok:false, reason: "Unregistered" | "BadDeviceToken" | "RateLimited" | "Transient" | "Fatal" }` for APNs (HTTP/2, .p8 key, `apns2`) and FCM v1 (`firebase-admin`).
**Facade:** `createApnsSender(env)`, `createFcmSender(env)`, `recordingSender()` (tests).
**Out of scope:** deciding who gets what (notifications), Expo Push Service.
**Invariants tested:** error mapping table (each provider error → one of the five reasons) · timeout 10 s → Transient · payload never contains PII beyond ids · 429 → RateLimited with retryAfter.
