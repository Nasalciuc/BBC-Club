-- Expand-only: quote-ready inbox rows keyed by request, not offer.
ALTER TABLE notifications.notifications
  ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS notif_member_request_cat
  ON notifications.notifications (member_id, request_id, category)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notif_request
  ON notifications.notifications (request_id)
  WHERE request_id IS NOT NULL;
