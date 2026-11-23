-- Align the production baseline with all time-entry producers.
-- Older deployments only accepted web/manual/import, while mobile,
-- extension and schedule autofill legitimately use their own source values.
--
-- SQLite cannot alter a CHECK constraint in place.  The migration therefore
-- rebuilds the parent and its two dependent tables in dependency order.  A
-- previous version dropped time_entries while break_entries and
-- time_corrections still referenced it; D1 correctly rejected that upgrade
-- on populated databases.  The temporary copies below deliberately contain
-- no foreign keys, so the old parent is never dropped while a child table
-- still points at it.  IDs and all user data are copied explicitly.

DROP TRIGGER IF EXISTS time_entries_no_overlap_insert;
DROP TRIGGER IF EXISTS time_entries_no_overlap_update;
DROP TRIGGER IF EXISTS break_entries_bounds_insert;
DROP TRIGGER IF EXISTS break_entries_bounds_update;
DROP TRIGGER IF EXISTS break_entries_no_overlap_insert;
DROP TRIGGER IF EXISTS break_entries_no_overlap_update;
DROP TRIGGER IF EXISTS time_entry_break_bounds_update_guard;
DROP INDEX IF EXISTS time_entries_one_open_per_employee;
DROP INDEX IF EXISTS time_entries_employee_id_idx;
DROP INDEX IF EXISTS time_entries_employee_idempotency_unique;

DROP INDEX IF EXISTS break_entries_one_open_per_entry;
DROP INDEX IF EXISTS break_entries_time_entry_id_idx;
DROP INDEX IF EXISTS time_corrections_employee_id_idx;
DROP INDEX IF EXISTS time_corrections_status_idx;
DROP TABLE IF EXISTS break_entries_source_contract_backup;
DROP TABLE IF EXISTS time_corrections_source_contract_backup;

CREATE TABLE break_entries_source_contract_backup (
  id INTEGER PRIMARY KEY,
  time_entry_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO break_entries_source_contract_backup (
  id, time_entry_id, started_at, ended_at, created_at
)
SELECT id, time_entry_id, started_at, ended_at, created_at
FROM break_entries;

CREATE TABLE time_corrections_source_contract_backup (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  time_entry_id INTEGER,
  requested_clock_in TEXT NOT NULL,
  requested_clock_out TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  reviewer_email TEXT,
  reviewer_note TEXT NOT NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO time_corrections_source_contract_backup (
  id, employee_id, time_entry_id, requested_clock_in,
  requested_clock_out, reason, status, reviewer_email, reviewer_note,
  reviewed_at, created_at
)
SELECT id, employee_id, time_entry_id, requested_clock_in,
  requested_clock_out, reason, status, reviewer_email, reviewer_note,
  reviewed_at, created_at
FROM time_corrections;

-- Remove the only tables that reference time_entries before replacing the
-- parent.  Their contents are retained in the FK-free backups above.
DROP TABLE break_entries;
DROP TABLE time_corrections;

CREATE TABLE time_entries_source_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  project_id INTEGER REFERENCES time_projects(id),
  time_code TEXT NOT NULL DEFAULT 'project',
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  work_mode TEXT NOT NULL DEFAULT 'office'
    CHECK (work_mode IN ('office', 'remote')),
  source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'manual', 'import', 'mobile', 'chrome_extension', 'autofill')),
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (clock_out IS NULL OR clock_out > clock_in)
);

INSERT INTO time_entries_source_contract (
  id, employee_id, project_id, time_code, clock_in, clock_out, work_mode,
  source, note, idempotency_key, created_at
)
SELECT
  id, employee_id, project_id, time_code, clock_in, clock_out, work_mode,
  source, note, idempotency_key, created_at
FROM time_entries;

DROP TABLE time_entries;
ALTER TABLE time_entries_source_contract RENAME TO time_entries;

CREATE TABLE break_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_entry_id INTEGER NOT NULL REFERENCES time_entries(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ended_at IS NULL OR ended_at > started_at)
);

INSERT INTO break_entries (id, time_entry_id, started_at, ended_at, created_at)
SELECT id, time_entry_id, started_at, ended_at, created_at
FROM break_entries_source_contract_backup;

CREATE TABLE time_corrections (
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

INSERT INTO time_corrections (
  id, employee_id, time_entry_id, requested_clock_in,
  requested_clock_out, reason, status, reviewer_email, reviewer_note,
  reviewed_at, created_at
)
SELECT id, employee_id, time_entry_id, requested_clock_in,
  requested_clock_out, reason, status, reviewer_email, reviewer_note,
  reviewed_at, created_at
FROM time_corrections_source_contract_backup;

DROP TABLE break_entries_source_contract_backup;
DROP TABLE time_corrections_source_contract_backup;

CREATE UNIQUE INDEX time_entries_one_open_per_employee
  ON time_entries(employee_id) WHERE clock_out IS NULL;
CREATE INDEX time_entries_employee_id_idx ON time_entries(employee_id);
CREATE UNIQUE INDEX time_entries_employee_idempotency_unique
  ON time_entries(employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX break_entries_one_open_per_entry
  ON break_entries(time_entry_id) WHERE ended_at IS NULL;
CREATE INDEX break_entries_time_entry_id_idx ON break_entries(time_entry_id);
CREATE INDEX time_corrections_employee_id_idx ON time_corrections(employee_id);
CREATE INDEX time_corrections_status_idx ON time_corrections(status);

CREATE TRIGGER time_entries_no_overlap_insert
BEFORE INSERT ON time_entries
WHEN EXISTS (
  SELECT 1 FROM time_entries existing
  WHERE existing.employee_id = NEW.employee_id
    AND NOT (NEW.clock_out IS NULL AND existing.clock_out IS NULL)
    AND NEW.clock_in < COALESCE(existing.clock_out, '9999-12-31T23:59:59.999Z')
    AND existing.clock_in < COALESCE(NEW.clock_out, '9999-12-31T23:59:59.999Z')
)
BEGIN SELECT RAISE(ABORT, 'time_entry_overlap'); END;

CREATE TRIGGER time_entries_no_overlap_update
BEFORE UPDATE OF employee_id, clock_in, clock_out ON time_entries
WHEN EXISTS (
  SELECT 1 FROM time_entries existing
  WHERE existing.id <> OLD.id
    AND existing.employee_id = NEW.employee_id
    AND NOT (NEW.clock_out IS NULL AND existing.clock_out IS NULL)
    AND NEW.clock_in < COALESCE(existing.clock_out, '9999-12-31T23:59:59.999Z')
    AND existing.clock_in < COALESCE(NEW.clock_out, '9999-12-31T23:59:59.999Z')
)
BEGIN SELECT RAISE(ABORT, 'time_entry_overlap'); END;

CREATE TRIGGER break_entries_bounds_insert
BEFORE INSERT ON break_entries
WHEN NOT EXISTS (
  SELECT 1 FROM time_entries entry
  WHERE entry.id = NEW.time_entry_id
    AND NEW.started_at >= entry.clock_in
    AND (entry.clock_out IS NULL OR NEW.started_at < entry.clock_out)
    AND (NEW.ended_at IS NULL OR (NEW.ended_at > NEW.started_at
      AND (entry.clock_out IS NULL OR NEW.ended_at <= entry.clock_out)))
)
BEGIN SELECT RAISE(ABORT, 'break_outside_time_entry'); END;

CREATE TRIGGER break_entries_bounds_update
BEFORE UPDATE OF time_entry_id, started_at, ended_at ON break_entries
WHEN NOT EXISTS (
  SELECT 1 FROM time_entries entry
  WHERE entry.id = NEW.time_entry_id
    AND NEW.started_at >= entry.clock_in
    AND (entry.clock_out IS NULL OR NEW.started_at < entry.clock_out)
    AND (NEW.ended_at IS NULL OR (NEW.ended_at > NEW.started_at
      AND (entry.clock_out IS NULL OR NEW.ended_at <= entry.clock_out)))
)
BEGIN SELECT RAISE(ABORT, 'break_outside_time_entry'); END;

CREATE TRIGGER break_entries_no_overlap_insert
BEFORE INSERT ON break_entries
WHEN EXISTS (
  SELECT 1 FROM break_entries existing
  WHERE existing.time_entry_id = NEW.time_entry_id
    AND NEW.started_at < COALESCE(existing.ended_at, '9999-12-31T23:59:59.999Z')
    AND existing.started_at < COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z')
)
BEGIN SELECT RAISE(ABORT, 'break_overlap'); END;

CREATE TRIGGER break_entries_no_overlap_update
BEFORE UPDATE OF time_entry_id, started_at, ended_at ON break_entries
WHEN EXISTS (
  SELECT 1 FROM break_entries existing
  WHERE existing.id <> OLD.id
    AND existing.time_entry_id = NEW.time_entry_id
    AND NEW.started_at < COALESCE(existing.ended_at, '9999-12-31T23:59:59.999Z')
    AND existing.started_at < COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z')
)
BEGIN SELECT RAISE(ABORT, 'break_overlap'); END;

CREATE TRIGGER time_entry_break_bounds_update_guard
BEFORE UPDATE OF clock_in, clock_out ON time_entries
WHEN EXISTS (
  SELECT 1 FROM break_entries break
  WHERE break.time_entry_id = NEW.id
    AND (break.started_at < NEW.clock_in OR (
      NEW.clock_out IS NOT NULL
      AND (break.ended_at IS NULL OR break.ended_at > NEW.clock_out)
    ))
)
BEGIN SELECT RAISE(ABORT, 'time_entry_break_outside_interval'); END;
