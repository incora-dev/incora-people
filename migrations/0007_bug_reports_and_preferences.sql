ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'uk';

CREATE TABLE stored_files_next (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('employee_document', 'reimbursement_receipt', 'bug_screenshot')),
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('contract', 'identity', 'tax', 'policy', 'receipt', 'bug', 'other')),
  owner_employee_id INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by_email TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_employee_id) REFERENCES employees(id)
);

INSERT INTO stored_files_next
SELECT * FROM stored_files;
DROP TABLE stored_files;
ALTER TABLE stored_files_next RENAME TO stored_files;
CREATE INDEX stored_files_owner_kind_idx
  ON stored_files(owner_employee_id, kind, created_at);
CREATE INDEX stored_files_related_idx
  ON stored_files(related_entity_type, related_entity_id);

CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_email TEXT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  description TEXT NOT NULL,
  screenshot_file_id TEXT REFERENCES stored_files(id),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  resolved_by_email TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bug_reports_status_created_idx
  ON bug_reports(status, created_at);
CREATE INDEX IF NOT EXISTS bug_reports_reporter_idx
  ON bug_reports(reporter_email);
