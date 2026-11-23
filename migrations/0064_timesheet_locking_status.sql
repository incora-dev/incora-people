-- Extend the period state machine for atomic lock finalization.
-- The original table only allowed open/locked, which rejected the
-- intermediate locking state and the existing approved/revision_required API
-- states before the application could finalize a snapshot.
PRAGMA foreign_keys = OFF;

CREATE TABLE timesheet_periods_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'locking', 'locked', 'approved', 'revision_required')),
  note TEXT NOT NULL DEFAULT '',
  locked_by_email TEXT,
  locked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  snapshot_worked_minutes INTEGER,
  snapshot_expected_minutes INTEGER,
  snapshot_overtime_minutes INTEGER,
  snapshot_captured_at TEXT,
  lock_token TEXT,
  UNIQUE(employee_id, month)
);

INSERT INTO timesheet_periods_rebuild (
  id, employee_id, month, status, note, locked_by_email, locked_at,
  updated_at, snapshot_worked_minutes, snapshot_expected_minutes,
  snapshot_overtime_minutes, snapshot_captured_at, lock_token
)
SELECT
  id, employee_id, month, status, note, locked_by_email, locked_at,
  updated_at, snapshot_worked_minutes, snapshot_expected_minutes,
  snapshot_overtime_minutes, snapshot_captured_at, lock_token
FROM timesheet_periods;

DROP TABLE timesheet_periods;
ALTER TABLE timesheet_periods_rebuild RENAME TO timesheet_periods;

CREATE INDEX IF NOT EXISTS timesheet_periods_month_status_idx
  ON timesheet_periods(month, status);
CREATE UNIQUE INDEX IF NOT EXISTS timesheet_periods_lock_token_unique
  ON timesheet_periods(lock_token)
  WHERE lock_token IS NOT NULL;

PRAGMA foreign_keys = ON;
