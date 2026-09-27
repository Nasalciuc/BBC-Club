-- Expand-only: GCRA theoretical arrival time. The old platform.rate_limits table stays.
CREATE TABLE IF NOT EXISTS platform.rate_limit_state (
  key text PRIMARY KEY,
  tat timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_state_tat ON platform.rate_limit_state (tat);
