CREATE TABLE `client_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_email` text NOT NULL,
  `client_type` text NOT NULL CHECK (`client_type` IN ('chrome_extension', 'mobile')),
  `device_id` text NOT NULL,
  `refresh_token_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `last_used_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `client_sessions_user_active_idx`
  ON `client_sessions` (`user_email`, `expires_at`);

CREATE TABLE `oauth_authorization_codes` (
  `code_hash` text PRIMARY KEY NOT NULL,
  `user_email` text NOT NULL,
  `client_type` text NOT NULL CHECK (`client_type` IN ('chrome_extension', 'mobile')),
  `redirect_uri` text NOT NULL,
  `code_challenge` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `oauth_authorization_codes_expiry_idx`
  ON `oauth_authorization_codes` (`expires_at`);
