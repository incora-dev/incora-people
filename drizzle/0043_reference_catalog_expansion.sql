DROP TRIGGER IF EXISTS employees_employment_reference_insert;
DROP TRIGGER IF EXISTS employees_employment_reference_update;
DROP TRIGGER IF EXISTS employment_type_label_cascade;
DROP TRIGGER IF EXISTS employment_type_in_use_active;

ALTER TABLE employees DROP COLUMN employment_type_value_id;

CREATE TABLE employment_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO employment_types (value,label,sort_order)
SELECT lower(trim(employment_type)),trim(employment_type),500
FROM employees WHERE trim(employment_type)<>'';

ALTER TABLE employees ADD COLUMN employment_type_id INTEGER REFERENCES employment_types(id);
UPDATE employees SET employment_type_id=(
  SELECT id FROM employment_types
  WHERE lower(trim(label))=lower(trim(employees.employment_type))
  ORDER BY active DESC,id LIMIT 1
);

CREATE TRIGGER employees_employment_reference_insert BEFORE INSERT ON employees
WHEN NEW.employment_type_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM employment_types WHERE id=NEW.employment_type_id AND active=1 AND label=NEW.employment_type
)
BEGIN SELECT RAISE(ABORT, 'invalid employment type reference'); END;

CREATE TRIGGER employees_employment_reference_update BEFORE UPDATE OF employment_type,employment_type_id ON employees
WHEN NEW.employment_type_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM employment_types WHERE id=NEW.employment_type_id AND active=1 AND label=NEW.employment_type
)
BEGIN SELECT RAISE(ABORT, 'invalid employment type reference'); END;

CREATE TRIGGER employment_type_label_cascade AFTER UPDATE OF label ON employment_types
BEGIN UPDATE employees SET employment_type=NEW.label WHERE employment_type_id=NEW.id; END;

CREATE TRIGGER employment_type_in_use_active BEFORE UPDATE OF active ON employment_types
WHEN NEW.active=0 AND EXISTS (SELECT 1 FROM employees WHERE employment_type_id=NEW.id)
BEGIN SELECT RAISE(ABORT, 'employment type is assigned to employees'); END;
