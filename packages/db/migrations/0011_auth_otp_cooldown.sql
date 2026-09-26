-- Expand-only: per-email OTP send cooldown (sha256 key; never stores the address).
CREATE TABLE IF NOT EXISTS auth.otp_cooldown (
  key text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL
);
