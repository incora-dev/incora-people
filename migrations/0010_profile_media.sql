PRAGMA foreign_keys = OFF;

CREATE TABLE stored_files_profile_media (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN (
      'employee_document',
      'reimbursement_receipt',
      'bug_screenshot',
      'profile_photo',
      'profile_cover'
    )),
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN (
      'contract',
      'identity',
      'tax',
      'policy',
      'receipt',
      'bug',
      'profile',
      'other'
    )),
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

INSERT INTO stored_files_profile_media
SELECT * FROM stored_files;
DROP TABLE stored_files;
ALTER TABLE stored_files_profile_media RENAME TO stored_files;

CREATE INDEX stored_files_owner_kind_idx
  ON stored_files(owner_employee_id, kind, created_at);
CREATE INDEX stored_files_related_idx
  ON stored_files(related_entity_type, related_entity_id);

PRAGMA foreign_keys = ON;
