PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS company_holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS company_holidays_date_idx
  ON company_holidays(date);

CREATE TABLE IF NOT EXISTS people_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'onboarding', 'offboarding')),
  assignee_employee_id INTEGER NOT NULL REFERENCES employees(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'done')),
  created_by_email TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS people_tasks_assignee_status_idx
  ON people_tasks(assignee_employee_id, status);

CREATE INDEX IF NOT EXISTS people_tasks_due_date_idx
  ON people_tasks(due_date);
