# integration/email
**Owns:** nothing in the database.
**Ports (implements):** `EmailSender.sendOtp({ to, otp, purpose })` — Postmark (primary), SES (fallback, same interface), console (dev), capturing (tests).
**Facade:** `postmarkSender(opts)`, `sesSender(opts)`, `consoleSender()`.
**Out of scope:** marketing email, templates beyond OTP (v2: React Email).
**Invariants tested:** recipient = input.to · awaited · non-2xx throws with status · subject per purpose · dev sender never used when NODE_ENV=production (env.ts refuses without token).
