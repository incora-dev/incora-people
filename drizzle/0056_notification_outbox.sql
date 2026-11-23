CREATE TABLE IF NOT EXISTS `notification_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `channel` text DEFAULT 'push' NOT NULL CHECK (`channel` IN ('push')),
  `user_email` text NOT NULL,
  `title` text NOT NULL,
  `message` text NOT NULL,
  `href` text DEFAULT '/' NOT NULL,
  `dedupe_key` text NOT NULL UNIQUE,
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending', 'processing', 'sent', 'failed')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `available_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `last_error` text DEFAULT '' NOT NULL,
  `sent_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS `notification_outbox_due_idx`
  ON `notification_outbox` (`status`, `available_at`);
CREATE INDEX IF NOT EXISTS `notification_outbox_recipient_idx`
  ON `notification_outbox` (`user_email`);
