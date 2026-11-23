-- Durable client-token replay detection and shared authentication throttling.
-- Existing sessions receive a family id and one ledger row for their current
-- token; newly issued tokens are appended to the same family by the runtime.
ALTER TABLE client_sessions ADD COLUMN token_family_id TEXT NOT NULL DEFAULT '';
UPDATE client_sessions
SET token_family_id = id
WHERE token_family_id = '';

CREATE TABLE IF NOT EXISTS client_session_refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
  token_family_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS client_session_refresh_tokens_session_idx
  ON client_session_refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS client_session_refresh_tokens_family_idx
  ON client_session_refresh_tokens(token_family_id);

INSERT OR IGNORE INTO client_session_refresh_tokens
  (id, session_id, token_family_id, token_hash, issued_at)
SELECT id || ':initial', id, token_family_id, refresh_token_hash, created_at
FROM client_sessions;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
