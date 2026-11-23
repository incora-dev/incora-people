PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS timesheet_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'locked')),
  note TEXT NOT NULL DEFAULT '',
  locked_by_email TEXT,
  locked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, month)
);

CREATE INDEX IF NOT EXISTS timesheet_periods_month_status_idx
  ON timesheet_periods(month, status);
