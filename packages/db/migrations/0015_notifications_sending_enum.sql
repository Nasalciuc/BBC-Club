-- A new enum value cannot be used in the transaction that adds it.
ALTER TYPE notifications.notification_status ADD VALUE IF NOT EXISTS 'sending';
