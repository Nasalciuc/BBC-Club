CREATE INDEX CONCURRENTLY IF NOT EXISTS notif_sending_claimed
  ON notifications.notifications (claimed_at)
  WHERE status = 'sending';
