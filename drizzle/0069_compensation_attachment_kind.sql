-- Reviewed Sites/Drizzle mirror of migrations/0066_compensation_attachment_kind.sql.
-- Compensation attachments remain private and retain scan lifecycle metadata.
-- Sites applies migrations inside a transaction; defer references instead of
-- attempting to switch foreign_keys off inside that transaction.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE stored_files_compensation_kind (
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
    'compensation_attachment',
    'announcement_image',
    'announcement_poll_option_image'
  )),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'contract', 'identity', 'tax', 'policy', 'receipt', 'bug', 'profile',
    'company', 'certification', 'knowledge', 'announcement', 'other'
  )),
  owner_employee_id INTEGER NOT NULL REFERENCES employees(id),
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
  scan_status TEXT NOT NULL DEFAULT 'unscanned'
    CHECK (scan_status IN ('unscanned', 'clean', 'quarantined', 'failed')),
  scanned_at TEXT,
  scan_provider TEXT,
  scan_error TEXT NOT NULL DEFAULT ''
);

INSERT INTO stored_files_compensation_kind (
  id, kind, category, owner_employee_id, object_key, original_name,
  content_type, size_bytes, uploaded_by_email, related_entity_type,
  related_entity_id, created_at, folder_id, visibility, scan_status,
  scanned_at, scan_provider, scan_error
)
SELECT
  id, kind, category, owner_employee_id, object_key, original_name,
  content_type, size_bytes, uploaded_by_email, related_entity_type,
  related_entity_id, created_at, folder_id, visibility, scan_status,
  scanned_at, scan_provider, scan_error
FROM stored_files;

DROP TABLE stored_files;
ALTER TABLE stored_files_compensation_kind RENAME TO stored_files;

CREATE INDEX IF NOT EXISTS stored_files_owner_kind_idx
  ON stored_files(owner_employee_id, kind, created_at);
CREATE INDEX IF NOT EXISTS stored_files_related_idx
  ON stored_files(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS stored_files_folder_idx
  ON stored_files(folder_id);
CREATE INDEX IF NOT EXISTS stored_files_scan_status_idx
  ON stored_files(scan_status, created_at);

PRAGMA defer_foreign_keys = OFF;
