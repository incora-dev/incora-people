ALTER TABLE employees
ADD COLUMN default_work_mode TEXT NOT NULL DEFAULT 'office';

CREATE TABLE work_mode_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'office',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX work_mode_entries_employee_date_unique
ON work_mode_entries(employee_id, work_date);

CREATE INDEX work_mode_entries_date_mode_idx
ON work_mode_entries(work_date, mode);

CREATE TABLE game_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
  user_email TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX game_scores_best_idx ON game_scores(best_score);
