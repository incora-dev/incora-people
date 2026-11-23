-- Identity admission and revocable sessions.
ALTER TABLE users ADD COLUMN provider_subject TEXT;
ALTER TABLE users ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN disabled_at TEXT;
ALTER TABLE users ADD COLUMN disabled_by_email TEXT;

CREATE UNIQUE INDEX users_provider_subject_unique
  ON users(provider_subject)
  WHERE provider_subject IS NOT NULL;

ALTER TABLE client_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE oauth_authorization_codes ADD COLUMN user_id INTEGER REFERENCES users(id);

UPDATE client_sessions
SET user_id = (
  SELECT u.id FROM users u
  WHERE lower(u.email) = lower(client_sessions.user_email)
)
WHERE user_id IS NULL;

UPDATE oauth_authorization_codes
SET user_id = (
  SELECT u.id FROM users u
  WHERE lower(u.email) = lower(oauth_authorization_codes.user_email)
)
WHERE user_id IS NULL;

CREATE INDEX client_sessions_user_id_active_idx
  ON client_sessions(user_id, expires_at);
CREATE INDEX oauth_authorization_codes_user_id_idx
  ON oauth_authorization_codes(user_id);

CREATE TABLE web_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider_subject TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX web_sessions_user_active_idx
  ON web_sessions(user_id, expires_at);

UPDATE users
SET enabled = 0,
    disabled_at = COALESCE(disabled_at, CURRENT_TIMESTAMP),
    disabled_by_email = COALESCE(disabled_by_email, 'system:migration')
WHERE employee_id IN (SELECT id FROM employees WHERE status = 'inactive');

