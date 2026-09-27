-- Expand-only: per-email OTP send cooldown (sha256 key; never stores the address).
-- otp_hash lets a Better Auth replacement code send even inside the 30s window.
CREATE TABLE IF NOT EXISTS auth.otp_cooldown (
  key text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL,
  otp_hash text
);
ALTER TABLE auth.otp_cooldown ADD COLUMN IF NOT EXISTS otp_hash text;
