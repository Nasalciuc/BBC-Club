ALTER TABLE notifications.notifications ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
