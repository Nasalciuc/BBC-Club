-- Expand-only: store the parsed E.164 and whether libphonenumber accepted it.
-- phone_valid is computed at write time, never asserted as a literal.
ALTER TABLE requests.requests
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_valid boolean NOT NULL DEFAULT false;
