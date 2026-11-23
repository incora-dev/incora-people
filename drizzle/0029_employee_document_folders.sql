CREATE TABLE IF NOT EXISTS employee_document_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'employee_hr'
    CHECK (visibility IN ('employee_hr', 'hr_only')),
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, name)
);

ALTER TABLE stored_files ADD COLUMN folder_id INTEGER REFERENCES employee_document_folders(id);
ALTER TABLE stored_files ADD COLUMN visibility TEXT NOT NULL DEFAULT 'employee_hr'
  CHECK (visibility IN ('employee_hr', 'hr_only'));

CREATE INDEX IF NOT EXISTS stored_files_folder_idx ON stored_files(folder_id);

INSERT OR IGNORE INTO employee_document_folders
  (employee_id, name, visibility, created_by_email)
SELECT id, 'Employee documents', 'employee_hr', 'system@incora.local'
FROM employees;

INSERT OR IGNORE INTO employee_document_folders
  (employee_id, name, visibility, created_by_email)
SELECT id, 'HR private', 'hr_only', 'system@incora.local'
FROM employees;

UPDATE stored_files
SET folder_id = (
  SELECT folder.id
  FROM employee_document_folders AS folder
  WHERE folder.employee_id = stored_files.owner_employee_id
    AND folder.name = 'Employee documents'
)
WHERE kind = 'employee_document' AND folder_id IS NULL;
