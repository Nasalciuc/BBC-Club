# integration/push

**Owns:** nothing in the database (pure adapters).
**Publishes:** none.
**Consumes:** none.
**Ports (implements):** `PushSender.send({ platform, token, title, body, data }) → { ok, ticketId? } | { ok:false, reason: "Unregistered" | "BadDeviceToken" | "RateLimited" | "Transient" | "Fatal" }` for APNs (HTTP/2, .p8 key, `jose`) and FCM v1 (OAuth service account, `jose`).
**Facade:** `pushModule()` picks the sender from env: `recordingSender()` until `PUSH_ADAPTER=live`; live, `fcmSender` for Android and `apnsSender` for iPhone. APNs is optional (all of its keys or none, checked by `loadEnv`): without it an iPhone push returns `Fatal` with no request, so the notification is marked `failed` and the device token stays for when the keys arrive.
**Out of scope:** deciding who gets what (notifications), Expo Push Service.
**Invariants tested:** error mapping table (each provider error → one of the five reasons) · timeout 10 s → Transient · payload never contains PII beyond ids · 429 → RateLimited with retryAfter.
