CREATE TABLE IF NOT EXISTS employee_view_previews (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_web_session_id TEXT NOT NULL REFERENCES web_sessions(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  return_path TEXT NOT NULL,
  CHECK (
    (status = 'active' AND ended_at IS NULL) OR
    (status <> 'active' AND ended_at IS NOT NULL)
  ),
  CHECK (expires_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_view_previews_session_active_uq
  ON employee_view_previews(actor_web_session_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS employee_view_previews_actor_idx
  ON employee_view_previews(actor_user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS employee_view_preview_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('preview_started', 'preview_ended', 'preview_expired', 'unauthorized_preview_attempt')
  ),
  preview_id TEXT,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id INTEGER,
  target_employee_id INTEGER,
  session_reference_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS employee_view_preview_audit_actor_idx
  ON employee_view_preview_audit(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS employee_view_preview_audit_target_idx
  ON employee_view_preview_audit(target_employee_id, created_at);

CREATE TRIGGER IF NOT EXISTS employee_view_preview_audit_no_update
BEFORE UPDATE ON employee_view_preview_audit
BEGIN
  SELECT RAISE(ABORT, 'employee view preview audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS employee_view_preview_audit_no_delete
BEFORE DELETE ON employee_view_preview_audit
BEGIN
  SELECT RAISE(ABORT, 'employee view preview audit is append-only');
END;
