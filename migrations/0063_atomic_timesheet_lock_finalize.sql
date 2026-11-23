-- Reserve timesheet locking with a token so snapshot + final status + audit
-- can be finalized atomically after the lock reservation succeeds.
ALTER TABLE timesheet_periods ADD COLUMN lock_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS timesheet_periods_lock_token_unique
  ON timesheet_periods(lock_token)
  WHERE lock_token IS NOT NULL;
