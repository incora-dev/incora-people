ALTER TABLE employees ADD COLUMN division_unit_id INTEGER REFERENCES org_units(id);
ALTER TABLE employees ADD COLUMN department_unit_id INTEGER REFERENCES org_units(id);
ALTER TABLE employees ADD COLUMN team_unit_id INTEGER REFERENCES org_units(id);
ALTER TABLE employees ADD COLUMN position_value_id INTEGER REFERENCES reference_values(id);
ALTER TABLE employees ADD COLUMN level_value_id INTEGER REFERENCES reference_values(id);
ALTER TABLE employee_profile_records ADD COLUMN reference_value_id INTEGER REFERENCES reference_values(id);

INSERT INTO org_units (type, name, parent_id, active, sort_order)
SELECT 'division', source.name, NULL, 1, 500
FROM (SELECT DISTINCT trim(division) AS name FROM employees WHERE trim(division) <> '') source
WHERE NOT EXISTS (SELECT 1 FROM org_units unit WHERE unit.type='division' AND lower(trim(unit.name))=lower(source.name));

INSERT INTO org_units (type, name, parent_id, active, sort_order)
SELECT 'department', source.name, NULL, 1, 500
FROM (SELECT DISTINCT trim(department) AS name FROM employees WHERE trim(department) <> '') source
WHERE NOT EXISTS (SELECT 1 FROM org_units unit WHERE unit.type='department' AND lower(trim(unit.name))=lower(source.name));

INSERT INTO org_units (type, name, parent_id, active, sort_order)
SELECT 'team', source.name, NULL, 1, 500
FROM (SELECT DISTINCT trim(team) AS name FROM employees WHERE team IS NOT NULL AND trim(team) <> '') source
WHERE NOT EXISTS (SELECT 1 FROM org_units unit WHERE unit.type='team' AND lower(trim(unit.name))=lower(source.name));

INSERT OR IGNORE INTO reference_values (kind, value, label, sort_order)
SELECT 'position', lower(trim(job_title)), trim(job_title), 500
FROM employees WHERE trim(job_title) <> '';

INSERT OR IGNORE INTO reference_values (kind, value, label, sort_order)
SELECT 'level', lower(trim(level)), trim(level), 500
FROM employees WHERE level IS NOT NULL AND trim(level) <> '';

INSERT OR IGNORE INTO reference_values (kind, value, label, sort_order)
SELECT 'technology', lower(trim(title)), trim(title), 500
FROM employee_profile_records WHERE kind='skill' AND trim(title)<>'';

UPDATE employees SET
  division_unit_id = (SELECT id FROM org_units WHERE type = 'division' AND lower(trim(name)) = lower(trim(employees.division)) ORDER BY active DESC, id LIMIT 1),
  department_unit_id = (SELECT id FROM org_units WHERE type = 'department' AND lower(trim(name)) = lower(trim(employees.department)) ORDER BY active DESC, id LIMIT 1),
  team_unit_id = (SELECT id FROM org_units WHERE type = 'team' AND lower(trim(name)) = lower(trim(employees.team)) ORDER BY active DESC, id LIMIT 1),
  position_value_id = (SELECT id FROM reference_values WHERE kind = 'position' AND lower(trim(label)) = lower(trim(employees.job_title)) ORDER BY active DESC, id LIMIT 1),
  level_value_id = (SELECT id FROM reference_values WHERE kind = 'level' AND lower(trim(label)) = lower(trim(employees.level)) ORDER BY active DESC, id LIMIT 1),
  manager_name = NULL
WHERE manager_id IS NULL;
UPDATE employees SET
  manager_name = (SELECT first_name || ' ' || last_name FROM employees manager WHERE manager.id = employees.manager_id)
WHERE manager_id IS NOT NULL;

UPDATE employee_profile_records SET reference_value_id=(
  SELECT id FROM reference_values
  WHERE kind='technology' AND lower(trim(label))=lower(trim(employee_profile_records.title))
  ORDER BY active DESC,id LIMIT 1
) WHERE kind='skill';

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (key, value_json, updated_by_email) VALUES
  ('protected_super_admin_emails', '["person023@example.test","person005@example.test","person012@example.test","person003@example.test"]', 'system@incora-people.local'),
  ('employee_defaults', '{"division":"Ukraine","location":"Office","workMode":"office","employmentType":"Full-time","timezone":"Europe/Kyiv","workDays":"1,2,3,4,5","startTime":"09:00","endTime":"18:00","breakMinutes":60}', 'system@incora-people.local');

CREATE TABLE leave_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  year INTEGER NOT NULL,
  delta REAL NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('opening_usage','request_approved','request_withdrawn','reconciliation')),
  source_request_id INTEGER REFERENCES leave_requests(id),
  note TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX leave_ledger_request_event_unique ON leave_ledger (source_request_id, event_type);
CREATE INDEX leave_ledger_employee_type_year_idx ON leave_ledger (employee_id, leave_type_id, year);

INSERT OR IGNORE INTO leave_ledger (employee_id, leave_type_id, year, delta, event_type, source_request_id, note, actor_email)
SELECT employee_id, leave_type_id, CAST(substr(start_date, 1, 4) AS INTEGER), days, 'request_approved', id, 'Migrated approved request', 'system@incora-people.local'
FROM leave_requests
WHERE status = 'approved' AND EXISTS (SELECT 1 FROM leave_types WHERE id=leave_requests.leave_type_id AND code<>'unpaid');

INSERT INTO leave_ledger (employee_id, leave_type_id, year, delta, event_type, note, actor_email)
SELECT b.employee_id, b.leave_type_id, b.year,
  b.used - COALESCE((SELECT SUM(l.delta) FROM leave_ledger l WHERE l.employee_id=b.employee_id AND l.leave_type_id=b.leave_type_id AND l.year=b.year), 0),
  'opening_usage', 'Opening usage preserved during normalization', 'system@incora-people.local'
FROM leave_balances b
WHERE ABS(b.used - COALESCE((SELECT SUM(l.delta) FROM leave_ledger l WHERE l.employee_id=b.employee_id AND l.leave_type_id=b.leave_type_id AND l.year=b.year), 0)) > 0.0001;

CREATE TRIGGER employees_reference_integrity_insert
BEFORE INSERT ON employees
BEGIN
  SELECT RAISE(ABORT, 'invalid division reference') WHERE NEW.division_unit_id IS NULL OR NOT EXISTS (SELECT 1 FROM org_units WHERE id=NEW.division_unit_id AND type='division' AND active=1 AND name=NEW.division);
  SELECT RAISE(ABORT, 'invalid department reference') WHERE NEW.department_unit_id IS NULL OR NOT EXISTS (SELECT 1 FROM org_units WHERE id=NEW.department_unit_id AND type='department' AND active=1 AND name=NEW.department);
  SELECT RAISE(ABORT, 'invalid team reference') WHERE NEW.team_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_units WHERE id=NEW.team_unit_id AND type='team' AND active=1 AND name=NEW.team);
  SELECT RAISE(ABORT, 'invalid position reference') WHERE NEW.position_value_id IS NULL OR NOT EXISTS (SELECT 1 FROM reference_values WHERE id=NEW.position_value_id AND kind='position' AND active=1 AND label=NEW.job_title);
  SELECT RAISE(ABORT, 'invalid level reference') WHERE NEW.level_value_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reference_values WHERE id=NEW.level_value_id AND kind='level' AND active=1 AND label=NEW.level);
END;

CREATE TRIGGER employees_reference_integrity_update
BEFORE UPDATE OF division, department, team, job_title, level, division_unit_id, department_unit_id, team_unit_id, position_value_id, level_value_id ON employees
BEGIN
  SELECT RAISE(ABORT, 'invalid division reference') WHERE NEW.division_unit_id IS NULL OR NOT EXISTS (SELECT 1 FROM org_units WHERE id=NEW.division_unit_id AND type='division' AND active=1 AND name=NEW.division);
  SELECT RAISE(ABORT, 'invalid department reference') WHERE NEW.department_unit_id IS NULL OR NOT EXISTS (SELECT 1 FROM org_units WHERE id=NEW.department_unit_id AND type='department' AND active=1 AND name=NEW.department);
  SELECT RAISE(ABORT, 'invalid team reference') WHERE NEW.team_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_units WHERE id=NEW.team_unit_id AND type='team' AND active=1 AND name=NEW.team);
  SELECT RAISE(ABORT, 'invalid position reference') WHERE NEW.position_value_id IS NULL OR NOT EXISTS (SELECT 1 FROM reference_values WHERE id=NEW.position_value_id AND kind='position' AND active=1 AND label=NEW.job_title);
  SELECT RAISE(ABORT, 'invalid level reference') WHERE NEW.level_value_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reference_values WHERE id=NEW.level_value_id AND kind='level' AND active=1 AND label=NEW.level);
END;

CREATE TRIGGER employees_manager_cycle_insert
BEFORE INSERT ON employees WHEN NEW.manager_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'employee cannot manage themselves') WHERE NEW.manager_id=NEW.id;
END;

CREATE TRIGGER employees_manager_cycle_update
BEFORE UPDATE OF manager_id ON employees WHEN NEW.manager_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'employee cannot manage themselves') WHERE NEW.manager_id=NEW.id;
  SELECT RAISE(ABORT, 'manager hierarchy cycle') WHERE EXISTS (
    WITH RECURSIVE reports(id) AS (
      SELECT id FROM employees WHERE manager_id=NEW.id
      UNION ALL SELECT employee.id FROM employees employee JOIN reports ON employee.manager_id=reports.id
    ) SELECT 1 FROM reports WHERE id=NEW.manager_id
  );
END;

CREATE TRIGGER employees_email_sync AFTER UPDATE OF email ON employees
BEGIN UPDATE users SET email=NEW.email WHERE employee_id=NEW.id; END;

CREATE TRIGGER employees_manager_cache_sync AFTER UPDATE OF manager_id ON employees
BEGIN UPDATE employees SET manager_name=(SELECT first_name || ' ' || last_name FROM employees WHERE id=NEW.manager_id) WHERE id=NEW.id; END;

CREATE TRIGGER employees_name_cache_sync AFTER UPDATE OF first_name, last_name ON employees
BEGIN UPDATE employees SET manager_name=NEW.first_name || ' ' || NEW.last_name WHERE manager_id=NEW.id; END;

CREATE TRIGGER org_units_parent_cycle_insert BEFORE INSERT ON org_units WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'organization hierarchy cycle') WHERE NEW.parent_id=NEW.id;
END;

CREATE TRIGGER org_units_parent_cycle_update BEFORE UPDATE OF parent_id ON org_units WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'organization hierarchy cycle') WHERE NEW.parent_id=NEW.id;
  SELECT RAISE(ABORT, 'organization hierarchy cycle') WHERE EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM org_units WHERE parent_id=NEW.id
      UNION ALL SELECT unit.id FROM org_units unit JOIN descendants ON unit.parent_id=descendants.id
    ) SELECT 1 FROM descendants WHERE id=NEW.parent_id
  );
END;

CREATE TRIGGER org_units_name_cascade AFTER UPDATE OF name ON org_units
BEGIN
  UPDATE employees SET division=NEW.name WHERE division_unit_id=NEW.id AND NEW.type='division';
  UPDATE employees SET department=NEW.name WHERE department_unit_id=NEW.id AND NEW.type='department';
  UPDATE employees SET team=NEW.name WHERE team_unit_id=NEW.id AND NEW.type='team';
END;

CREATE TRIGGER org_units_in_use_active BEFORE UPDATE OF active ON org_units
WHEN NEW.active=0 AND EXISTS (
  SELECT 1 FROM employees WHERE division_unit_id=NEW.id OR department_unit_id=NEW.id OR team_unit_id=NEW.id
)
BEGIN SELECT RAISE(ABORT, 'organization unit is assigned to employees'); END;

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

CREATE TRIGGER leave_request_duration_insert BEFORE INSERT ON leave_requests
WHEN NEW.days<=0 OR abs(NEW.days*2-round(NEW.days*2))>0.0001
BEGIN SELECT RAISE(ABORT, 'leave duration must use half-day increments'); END;

CREATE TRIGGER leave_request_duration_update BEFORE UPDATE OF days ON leave_requests
WHEN NEW.days<=0 OR abs(NEW.days*2-round(NEW.days*2))>0.0001
BEGIN SELECT RAISE(ABORT, 'leave duration must use half-day increments'); END;

CREATE TRIGGER leave_request_overlap_insert BEFORE INSERT ON leave_requests
WHEN NEW.status IN ('pending','approved') AND EXISTS (
  SELECT 1 FROM leave_requests current
  WHERE current.employee_id=NEW.employee_id AND current.status IN ('pending','approved')
    AND current.start_date<=NEW.end_date AND current.end_date>=NEW.start_date
)
BEGIN SELECT RAISE(ABORT, 'leave request overlaps an existing request'); END;

CREATE TRIGGER leave_request_overlap_update BEFORE UPDATE OF start_date,end_date,status,employee_id ON leave_requests
WHEN NEW.status IN ('pending','approved') AND EXISTS (
  SELECT 1 FROM leave_requests current
  WHERE current.id<>NEW.id AND current.employee_id=NEW.employee_id AND current.status IN ('pending','approved')
    AND current.start_date<=NEW.end_date AND current.end_date>=NEW.start_date
)
BEGIN SELECT RAISE(ABORT, 'leave request overlaps an existing request'); END;

CREATE TRIGGER leave_request_balance_insert BEFORE INSERT ON leave_requests
WHEN NEW.status IN ('pending','approved')
  AND EXISTS (SELECT 1 FROM leave_types WHERE id=NEW.leave_type_id AND code<>'unpaid')
  AND NEW.days + COALESCE((
    SELECT SUM(days) FROM leave_requests current
    WHERE current.employee_id=NEW.employee_id AND current.leave_type_id=NEW.leave_type_id
      AND current.status='pending' AND substr(current.start_date,1,4)=substr(NEW.start_date,1,4)
  ),0) > COALESCE((
    SELECT allowance+adjustment-used FROM leave_balances
    WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id
      AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER)
  ),-1)
BEGIN SELECT RAISE(ABORT, 'insufficient leave balance'); END;

CREATE TRIGGER leave_request_state_transition BEFORE UPDATE OF status ON leave_requests
WHEN NOT (
  OLD.status=NEW.status OR
  (OLD.status='pending' AND NEW.status IN ('approved','rejected','withdrawn')) OR
  (OLD.status='approved' AND NEW.status='withdrawn')
)
BEGIN SELECT RAISE(ABORT, 'invalid leave request state transition'); END;

CREATE TRIGGER leave_request_approved_immutable BEFORE UPDATE OF employee_id,leave_type_id,start_date,end_date,days ON leave_requests
WHEN OLD.status='approved'
BEGIN SELECT RAISE(ABORT, 'approved leave request is immutable'); END;

CREATE UNIQUE INDEX users_employee_unique ON users(employee_id) WHERE employee_id IS NOT NULL;

CREATE TRIGGER protected_super_admin_delete
BEFORE DELETE ON users
WHEN EXISTS (SELECT 1 FROM system_settings WHERE key='protected_super_admin_emails' AND EXISTS (SELECT 1 FROM json_each(value_json) WHERE lower(value)=lower(OLD.email)))
BEGIN SELECT RAISE(ABORT, 'protected super administrator cannot be deleted'); END;

CREATE TRIGGER protected_super_admin_demote
BEFORE UPDATE OF role ON users
WHEN NEW.role <> 'super_admin' AND EXISTS (SELECT 1 FROM system_settings WHERE key='protected_super_admin_emails' AND EXISTS (SELECT 1 FROM json_each(value_json) WHERE lower(value)=lower(OLD.email)))
BEGIN SELECT RAISE(ABORT, 'protected super administrator cannot be demoted'); END;

CREATE TRIGGER leave_request_approved_insert
AFTER INSERT ON leave_requests
WHEN NEW.status = 'approved' AND EXISTS (SELECT 1 FROM leave_types WHERE id=NEW.leave_type_id AND code<>'unpaid')
BEGIN
  INSERT OR IGNORE INTO leave_ledger (employee_id,leave_type_id,year,delta,event_type,source_request_id,note,actor_email)
  VALUES (NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),NEW.days,'request_approved',NEW.id,'Approved automatically','system@incora-people.local');
  UPDATE leave_balances SET used=COALESCE((SELECT SUM(delta) FROM leave_ledger WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER)),0),updated_at=CURRENT_TIMESTAMP
  WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER);
END;

CREATE TRIGGER leave_request_approved_update
AFTER UPDATE OF status ON leave_requests
WHEN OLD.status <> 'approved' AND NEW.status = 'approved' AND EXISTS (SELECT 1 FROM leave_types WHERE id=NEW.leave_type_id AND code<>'unpaid')
BEGIN
  INSERT OR IGNORE INTO leave_ledger (employee_id,leave_type_id,year,delta,event_type,source_request_id,note,actor_email)
  VALUES (NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),NEW.days,'request_approved',NEW.id,'Request approved','system@incora-people.local');
  UPDATE leave_balances SET used=COALESCE((SELECT SUM(delta) FROM leave_ledger WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER)),0),updated_at=CURRENT_TIMESTAMP
  WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER);
END;

CREATE TRIGGER leave_request_withdrawn_update
AFTER UPDATE OF status ON leave_requests
WHEN OLD.status = 'approved' AND NEW.status = 'withdrawn' AND EXISTS (SELECT 1 FROM leave_types WHERE id=NEW.leave_type_id AND code<>'unpaid')
BEGIN
  INSERT OR IGNORE INTO leave_ledger (employee_id,leave_type_id,year,delta,event_type,source_request_id,note,actor_email)
  VALUES (NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),-NEW.days,'request_withdrawn',NEW.id,'Approved request withdrawn','system@incora-people.local');
  UPDATE leave_balances SET used=MAX(0,COALESCE((SELECT SUM(delta) FROM leave_ledger WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER)),0)),updated_at=CURRENT_TIMESTAMP
  WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER);
END;
