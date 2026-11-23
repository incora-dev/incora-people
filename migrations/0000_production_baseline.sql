PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  ukrainian_name TEXT,
  email TEXT NOT NULL UNIQUE,
  personal_email TEXT,
  phone TEXT,
  birth_date TEXT,
  gender TEXT,
  address TEXT,
  job_title TEXT NOT NULL,
  department TEXT NOT NULL,
  division TEXT NOT NULL DEFAULT 'Ukraine',
  team TEXT,
  level TEXT,
  location TEXT NOT NULL DEFAULT 'Lviv',
  manager_name TEXT,
  manager_id INTEGER REFERENCES employees(id),
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave', 'inactive')),
  start_date TEXT NOT NULL,
  probation_end TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'employee'
    CHECK (role IN ('hr_admin', 'manager', 'employee')),
  employee_id INTEGER REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS access_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  manage_people INTEGER NOT NULL DEFAULT 0,
  view_sensitive_data INTEGER NOT NULL DEFAULT 0,
  approve_leave INTEGER NOT NULL DEFAULT 0,
  approve_time INTEGER NOT NULL DEFAULT 0,
  approve_expenses INTEGER NOT NULL DEFAULT 0,
  view_audit INTEGER NOT NULL DEFAULT 0,
  manage_settings INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reimbursement_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UAH',
  per_request_limit INTEGER NOT NULL DEFAULT 100000 CHECK (per_request_limit > 0),
  annual_limit INTEGER NOT NULL DEFAULT 300000 CHECK (annual_limit > 0),
  max_requests_per_year INTEGER NOT NULL DEFAULT 12 CHECK (max_requests_per_year > 0),
  requires_receipt INTEGER NOT NULL DEFAULT 1,
  requires_approval INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reimbursement_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  category TEXT NOT NULL CHECK (category IN ('Sport', 'Health', 'Education', 'Other')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'UAH',
  expense_date TEXT NOT NULL,
  description TEXT NOT NULL,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewer_email TEXT,
  reviewer_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS org_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('company', 'division', 'department', 'team')),
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES org_units(id),
  lead_employee_id INTEGER REFERENCES employees(id),
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'manual', 'import')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (clock_out IS NULL OR clock_out > clock_in)
);

CREATE TABLE IF NOT EXISTS work_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
  work_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  break_minutes INTEGER NOT NULL DEFAULT 60 CHECK (break_minutes BETWEEN 0 AND 180),
  timezone TEXT NOT NULL DEFAULT 'Europe/Kyiv',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS break_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_entry_id INTEGER NOT NULL REFERENCES time_entries(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE TABLE IF NOT EXISTS time_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  time_entry_id INTEGER REFERENCES time_entries(id),
  requested_clock_in TEXT NOT NULL,
  requested_clock_out TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_email TEXT,
  reviewer_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (requested_clock_out > requested_clock_in)
);

CREATE TABLE IF NOT EXISTS employment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  effective_date TEXT NOT NULL,
  job_title TEXT NOT NULL,
  department TEXT NOT NULL,
  division TEXT NOT NULL DEFAULT 'Ukraine',
  team TEXT,
  level TEXT,
  location TEXT NOT NULL,
  manager_id INTEGER REFERENCES employees(id),
  employment_type TEXT NOT NULL,
  status TEXT NOT NULL,
  change_reason TEXT NOT NULL DEFAULT 'Profile update',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  default_allowance INTEGER NOT NULL DEFAULT 0 CHECK (default_allowance >= 0),
  requires_approval INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  year INTEGER NOT NULL,
  allowance INTEGER NOT NULL DEFAULT 0 CHECK (allowance >= 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  adjustment INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL CHECK (days > 0),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewer_email TEXT,
  reviewer_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  href TEXT NOT NULL DEFAULT '/',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique
  ON users(employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_employee
  ON time_entries(employee_id) WHERE clock_out IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS break_entries_one_open_per_entry
  ON break_entries(time_entry_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS time_entries_employee_id_idx ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS break_entries_time_entry_id_idx ON break_entries(time_entry_id);
CREATE INDEX IF NOT EXISTS time_corrections_employee_id_idx ON time_corrections(employee_id);
CREATE INDEX IF NOT EXISTS time_corrections_status_idx ON time_corrections(status);
CREATE INDEX IF NOT EXISTS employment_history_employee_id_idx ON employment_history(employee_id);
CREATE INDEX IF NOT EXISTS leave_requests_employee_id_idx ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests(status);
CREATE INDEX IF NOT EXISTS notifications_user_email_idx ON notifications(user_email);
CREATE INDEX IF NOT EXISTS reimbursement_requests_employee_id_idx ON reimbursement_requests(employee_id);
CREATE INDEX IF NOT EXISTS reimbursement_requests_status_idx ON reimbursement_requests(status);
CREATE INDEX IF NOT EXISTS org_units_parent_id_idx ON org_units(parent_id);
