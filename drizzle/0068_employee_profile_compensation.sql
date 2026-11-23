-- Reviewed Sites/Drizzle mirror of migrations/0065_employee_profile_compensation.sql.
-- Add structured private profile data and normalized compensation history.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE reference_values_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('technology', 'level', 'position', 'legal_entity')),
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO reference_values_next (
  id, kind, value, label, active, sort_order, created_at, updated_at
)
SELECT id, kind, value, label, active, sort_order, created_at, updated_at
FROM reference_values;

-- Triggers attached to referencing tables must not be compiled while the
-- referenced table is between DROP and RENAME. Recreate them below.
DROP TRIGGER IF EXISTS employees_reference_integrity_insert;
DROP TRIGGER IF EXISTS employees_reference_integrity_update;
DROP TRIGGER IF EXISTS reference_values_label_cascade;
DROP TRIGGER IF EXISTS reference_values_in_use_active;
DROP TRIGGER IF EXISTS employee_profile_reference_insert;
DROP TRIGGER IF EXISTS employee_profile_reference_update;

DROP TABLE reference_values;
ALTER TABLE reference_values_next RENAME TO reference_values;

CREATE UNIQUE INDEX reference_values_kind_value_unique
  ON reference_values(kind, value);
CREATE INDEX reference_values_kind_active_idx
  ON reference_values(kind, active, sort_order);

CREATE TRIGGER employees_reference_integrity_insert
BEFORE INSERT ON employees
BEGIN
  SELECT RAISE(ABORT, 'invalid division reference')
  WHERE NEW.division_unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM org_units
    WHERE id=NEW.division_unit_id AND type='division' AND active=1 AND name=NEW.division
  );
  SELECT RAISE(ABORT, 'invalid department reference')
  WHERE NEW.department_unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM org_units
    WHERE id=NEW.department_unit_id AND type='department' AND active=1 AND name=NEW.department
  );
  SELECT RAISE(ABORT, 'invalid team reference')
  WHERE NEW.team_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM org_units
    WHERE id=NEW.team_unit_id AND type='team' AND active=1 AND name=NEW.team
  );
  SELECT RAISE(ABORT, 'invalid position reference')
  WHERE NEW.position_value_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM reference_values
    WHERE id=NEW.position_value_id AND kind='position' AND active=1 AND label=NEW.job_title
  );
  SELECT RAISE(ABORT, 'invalid level reference')
  WHERE NEW.level_value_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_values
    WHERE id=NEW.level_value_id AND kind='level' AND active=1 AND label=NEW.level
  );
END;

CREATE TRIGGER employees_reference_integrity_update
BEFORE UPDATE OF division, department, team, job_title, level, division_unit_id, department_unit_id, team_unit_id, position_value_id, level_value_id ON employees
BEGIN
  SELECT RAISE(ABORT, 'invalid division reference')
  WHERE NEW.division_unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM org_units
    WHERE id=NEW.division_unit_id AND type='division' AND active=1 AND name=NEW.division
  );
  SELECT RAISE(ABORT, 'invalid department reference')
  WHERE NEW.department_unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM org_units
    WHERE id=NEW.department_unit_id AND type='department' AND active=1 AND name=NEW.department
  );
  SELECT RAISE(ABORT, 'invalid team reference')
  WHERE NEW.team_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM org_units
    WHERE id=NEW.team_unit_id AND type='team' AND active=1 AND name=NEW.team
  );
  SELECT RAISE(ABORT, 'invalid position reference')
  WHERE NEW.position_value_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM reference_values
    WHERE id=NEW.position_value_id AND kind='position' AND active=1 AND label=NEW.job_title
  );
  SELECT RAISE(ABORT, 'invalid level reference')
  WHERE NEW.level_value_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_values
    WHERE id=NEW.level_value_id AND kind='level' AND active=1 AND label=NEW.level
  );
END;

CREATE TRIGGER reference_values_label_cascade AFTER UPDATE OF label ON reference_values
BEGIN
  UPDATE employees SET job_title=NEW.label WHERE position_value_id=NEW.id AND NEW.kind='position';
  UPDATE employees SET level=NEW.label WHERE level_value_id=NEW.id AND NEW.kind='level';
  UPDATE employee_profile_records SET title=NEW.label WHERE reference_value_id=NEW.id AND NEW.kind='technology';
END;

CREATE TRIGGER reference_values_in_use_active BEFORE UPDATE OF active ON reference_values
WHEN NEW.active=0 AND (
  EXISTS (SELECT 1 FROM employees WHERE position_value_id=NEW.id OR level_value_id=NEW.id) OR
  EXISTS (SELECT 1 FROM employee_profile_records WHERE reference_value_id=NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'reference value is assigned to employees'); END;

CREATE TRIGGER employee_profile_reference_insert BEFORE INSERT ON employee_profile_records
WHEN NEW.kind='skill' AND (
  NEW.reference_value_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM reference_values WHERE id=NEW.reference_value_id AND kind='technology' AND active=1 AND label=NEW.title
  )
)
BEGIN SELECT RAISE(ABORT, 'invalid technology reference'); END;

CREATE TRIGGER employee_profile_reference_update BEFORE UPDATE OF kind,title,reference_value_id ON employee_profile_records
WHEN NEW.kind='skill' AND (
  NEW.reference_value_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM reference_values WHERE id=NEW.reference_value_id AND kind='technology' AND active=1 AND label=NEW.title
  )
)
BEGIN SELECT RAISE(ABORT, 'invalid technology reference'); END;

CREATE TABLE employee_private_details (
  employee_id INTEGER PRIMARY KEY NOT NULL REFERENCES employees(id),
  tax_code TEXT,
  contract_end_date TEXT,
  passport_number TEXT,
  passport_date TEXT,
  passport_authority TEXT,
  legal_entity_value_id INTEGER REFERENCES reference_values(id),
  updated_by_email TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Keep managed legal-entity references valid even for write paths that do not
-- go through the HR API. Deactivation is also blocked while the value is used.
DROP TRIGGER IF EXISTS reference_values_in_use_active;
CREATE TRIGGER reference_values_in_use_active BEFORE UPDATE OF active ON reference_values
WHEN NEW.active=0 AND (
  EXISTS (SELECT 1 FROM employees WHERE position_value_id=NEW.id OR level_value_id=NEW.id) OR
  EXISTS (SELECT 1 FROM employee_profile_records WHERE reference_value_id=NEW.id) OR
  EXISTS (SELECT 1 FROM employee_private_details WHERE legal_entity_value_id=NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'reference value is assigned to employees'); END;

CREATE TRIGGER employee_private_details_legal_entity_insert
BEFORE INSERT ON employee_private_details
WHEN NEW.legal_entity_value_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM reference_values
  WHERE id=NEW.legal_entity_value_id AND kind='legal_entity' AND active=1
)
BEGIN SELECT RAISE(ABORT, 'invalid legal entity reference'); END;

CREATE TRIGGER employee_private_details_legal_entity_update
BEFORE UPDATE OF legal_entity_value_id ON employee_private_details
WHEN NEW.legal_entity_value_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM reference_values
  WHERE id=NEW.legal_entity_value_id AND kind='legal_entity' AND active=1
)
BEGIN SELECT RAISE(ABORT, 'invalid legal entity reference'); END;

CREATE TABLE employee_compensations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  kind TEXT NOT NULL CHECK (kind IN ('base', 'additional')),
  label TEXT,
  effective_from TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR', 'UAH')),
  period TEXT NOT NULL CHECK (period IN ('year', 'month', 'week', 'day', 'hour')),
  payment_schedule TEXT NOT NULL CHECK (payment_schedule IN ('weekly', 'monthly', 'quarterly')),
  comment TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX employee_compensations_employee_kind_date_idx
  ON employee_compensations(employee_id, kind, effective_from);
CREATE UNIQUE INDEX employee_compensations_base_effective_unique
  ON employee_compensations(employee_id, effective_from)
  WHERE kind = 'base';

ALTER TABLE employee_terminations
  ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Clear deferred drop violations after the replacement table and its rows are
-- back in place; the enclosing migration transaction validates them at commit.
PRAGMA defer_foreign_keys = OFF;
