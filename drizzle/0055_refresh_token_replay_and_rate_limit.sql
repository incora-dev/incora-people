-- Durable client-token replay detection and shared authentication throttling.
ALTER TABLE `client_sessions` ADD COLUMN `token_family_id` text NOT NULL DEFAULT '';
UPDATE `client_sessions` SET `token_family_id` = `id` WHERE `token_family_id` = '';
CREATE TABLE IF NOT EXISTS `client_session_refresh_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL REFERENCES `client_sessions`(`id`) ON DELETE CASCADE,
  `token_family_id` text NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `used_at` text,
  `revoked_at` text
);
CREATE INDEX IF NOT EXISTS `client_session_refresh_tokens_session_idx`
  ON `client_session_refresh_tokens` (`session_id`);
CREATE INDEX IF NOT EXISTS `client_session_refresh_tokens_family_idx`
  ON `client_session_refresh_tokens` (`token_family_id`);
INSERT OR IGNORE INTO `client_session_refresh_tokens`
  (`id`, `session_id`, `token_family_id`, `token_hash`, `issued_at`)
SELECT `id` || ':initial', `id`, `token_family_id`, `refresh_token_hash`, `created_at`
FROM `client_sessions`;
CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `bucket_key` text PRIMARY KEY NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `reset_at` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
