-- Expand-only: IANA zone per airport so local clocks are not the device TZ.
ALTER TABLE catalog.airports
  ADD COLUMN IF NOT EXISTS tz text NOT NULL DEFAULT 'UTC';
