CREATE TABLE IF NOT EXISTS `mobile_push_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_email` text NOT NULL,
  `token` text NOT NULL,
  `platform` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `mobile_push_tokens_token_idx`
  ON `mobile_push_tokens` (`token`);
CREATE INDEX IF NOT EXISTS `mobile_push_tokens_user_active_idx`
  ON `mobile_push_tokens` (`user_email`, `active`);
