-- Durable push notification outbox.
-- In-app notifications are written synchronously; push delivery is retried by
-- the scheduled Worker and deduplicated by the stable event key.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push')),
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  href TEXT NOT NULL DEFAULT '/',
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON notification_outbox(status, available_at);
CREATE INDEX IF NOT EXISTS notification_outbox_recipient_idx
  ON notification_outbox(user_email);
