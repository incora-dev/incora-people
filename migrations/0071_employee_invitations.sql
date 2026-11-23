-- Transactional employee invitation attempts and post-rollout login activity.
-- Existing accounts are intentionally not backfilled: historical login state
-- is unknown and must not be represented as a fabricated first-login date.

ALTER TABLE users ADD COLUMN created_at TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE TRIGGER IF NOT EXISTS users_created_at_default
AFTER INSERT ON users
WHEN NEW.created_at IS NULL
BEGIN
  UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS employee_invitation_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  account_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_email TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend' CHECK (provider = 'resend'),
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'uncertain')),
  provider_message_id TEXT,
  payload_json TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT,
  failed_at TEXT,
  uncertain_at TEXT,
  failure_code TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  CHECK (
    (status = 'sending' AND accepted_at IS NULL AND failed_at IS NULL AND uncertain_at IS NULL AND failure_code IS NULL) OR
    (status = 'sent' AND accepted_at IS NOT NULL AND failed_at IS NULL AND uncertain_at IS NULL AND failure_code IS NULL) OR
    (status = 'failed' AND accepted_at IS NULL AND failed_at IS NOT NULL AND uncertain_at IS NULL AND failure_code IS NOT NULL) OR
    (status = 'uncertain' AND accepted_at IS NULL AND failed_at IS NULL AND uncertain_at IS NOT NULL AND failure_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS employee_invitation_attempts_employee_requested_idx
  ON employee_invitation_attempts(employee_id, requested_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS employee_invitation_attempts_actor_requested_idx
  ON employee_invitation_attempts(actor_user_id, requested_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS employee_invitation_attempts_open_employee_uq
  ON employee_invitation_attempts(employee_id)
  WHERE employee_id IS NOT NULL AND status IN ('sending', 'uncertain');

CREATE TRIGGER IF NOT EXISTS employee_invitation_attempts_immutable_fields
BEFORE UPDATE ON employee_invitation_attempts
WHEN NEW.id <> OLD.id
  OR NEW.target_email <> OLD.target_email
  OR NEW.provider <> OLD.provider
  OR NEW.payload_json <> OLD.payload_json
  OR NEW.requested_at <> OLD.requested_at
  OR NEW.actor_email <> OLD.actor_email
  OR (NEW.employee_id IS NOT NULL AND NEW.employee_id IS NOT OLD.employee_id)
  OR (NEW.account_user_id IS NOT NULL AND NEW.account_user_id IS NOT OLD.account_user_id)
  OR (NEW.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NOT OLD.actor_user_id)
BEGIN
  SELECT RAISE(ABORT, 'employee invitation attempt identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS employee_invitation_attempts_status_transition
BEFORE UPDATE OF status ON employee_invitation_attempts
WHEN NOT (
  OLD.status = NEW.status OR
  (OLD.status = 'sending' AND NEW.status IN ('sent', 'failed', 'uncertain')) OR
  (OLD.status = 'uncertain' AND NEW.status IN ('sending', 'sent', 'failed'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid employee invitation status transition');
END;

CREATE TRIGGER IF NOT EXISTS employee_invitation_attempts_no_delete
BEFORE DELETE ON employee_invitation_attempts
BEGIN
  SELECT RAISE(ABORT, 'employee invitation attempts are retained');
END;
