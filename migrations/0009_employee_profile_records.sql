CREATE TABLE employee_profile_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'skill',
      'education',
      'certification',
      'emergency_contact',
      'dependent',
      'experience',
      'compensation'
    )
  ),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  started_on TEXT,
  ended_on TEXT,
  notes TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER,
  currency TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX employee_profile_records_employee_kind_idx
ON employee_profile_records(employee_id, kind);
