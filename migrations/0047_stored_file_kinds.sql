-- Expand the private-file catalog without losing existing rows.
-- SQLite CHECK constraints cannot be altered in place, so rebuild the table
-- while preserving all metadata and the existing object references.
PRAGMA foreign_keys = OFF;

CREATE TABLE stored_files_expanded (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'employee_document',
    'reimbursement_receipt',
    'bug_screenshot',
    'profile_photo',
    'profile_cover',
    'company_document',
    'knowledge_attachment',
    'certificate_attachment',
    'announcement_image'
  )),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'contract',
    'identity',
    'tax',
    'policy',
    'receipt',
    'bug',
    'profile',
    'company',
    'certification',
    'knowledge',
    'announcement',
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
  folder_id INTEGER REFERENCES employee_document_folders(id),
  visibility TEXT NOT NULL DEFAULT 'employee_hr'
    CHECK (visibility IN ('employee_hr', 'hr_only')),
  FOREIGN KEY (owner_employee_id) REFERENCES employees(id)
);

INSERT INTO stored_files_expanded (
  id, kind, category, owner_employee_id, object_key, original_name,
  content_type, size_bytes, uploaded_by_email, related_entity_type,
  related_entity_id, created_at, folder_id, visibility
)
SELECT
  id, kind, category, owner_employee_id, object_key, original_name,
  content_type, size_bytes, uploaded_by_email, related_entity_type,
  related_entity_id, created_at, folder_id, visibility
FROM stored_files;

DROP TABLE stored_files;
ALTER TABLE stored_files_expanded RENAME TO stored_files;

CREATE INDEX IF NOT EXISTS stored_files_owner_kind_idx
  ON stored_files(owner_employee_id, kind, created_at);
CREATE INDEX IF NOT EXISTS stored_files_related_idx
  ON stored_files(related_entity_type, related_entity_id);

PRAGMA foreign_keys = ON;
