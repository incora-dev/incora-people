-- The integrity migrations require every employee to reference active
-- organization and catalog entries. Keep the demo seed self-contained so a
-- fresh local database can be rebuilt after the reference-catalog migrations.
INSERT INTO org_units
  (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'company', 'INCORA', NULL, NULL, 1, 0
WHERE NOT EXISTS (
  SELECT 1 FROM org_units WHERE type = 'company' AND lower(name) = 'incora'
);
INSERT INTO org_units
  (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'division', 'Ukraine',
  (SELECT id FROM org_units WHERE type = 'company' AND lower(name) = 'incora' LIMIT 1),
  NULL, 1, 10
WHERE NOT EXISTS (
  SELECT 1 FROM org_units WHERE type = 'division' AND lower(name) = 'ukraine'
);
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'department', 'Engineering',
  (SELECT id FROM org_units WHERE type = 'division' AND lower(name) = 'ukraine' LIMIT 1),
  NULL, 1, 20
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'department' AND lower(name) = 'engineering');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'department', 'Design',
  (SELECT id FROM org_units WHERE type = 'division' AND lower(name) = 'ukraine' LIMIT 1),
  NULL, 1, 30
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'department' AND lower(name) = 'design');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'department', 'Delivery',
  (SELECT id FROM org_units WHERE type = 'division' AND lower(name) = 'ukraine' LIMIT 1),
  NULL, 1, 40
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'department' AND lower(name) = 'delivery');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'department', 'People',
  (SELECT id FROM org_units WHERE type = 'division' AND lower(name) = 'ukraine' LIMIT 1),
  NULL, 1, 50
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'department' AND lower(name) = 'people');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'department', 'Administration',
  (SELECT id FROM org_units WHERE type = 'division' AND lower(name) = 'ukraine' LIMIT 1),
  NULL, 1, 100
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'department' AND lower(name) = 'administration');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'team', 'Engineering Team',
  (SELECT id FROM org_units WHERE type = 'department' AND lower(name) = 'engineering' LIMIT 1),
  NULL, 1, 60
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'team' AND lower(name) = 'engineering team');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'team', 'Design Team',
  (SELECT id FROM org_units WHERE type = 'department' AND lower(name) = 'design' LIMIT 1),
  NULL, 1, 70
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'team' AND lower(name) = 'design team');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'team', 'Delivery Team',
  (SELECT id FROM org_units WHERE type = 'department' AND lower(name) = 'delivery' LIMIT 1),
  NULL, 1, 80
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'team' AND lower(name) = 'delivery team');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'team', 'People Team',
  (SELECT id FROM org_units WHERE type = 'department' AND lower(name) = 'people' LIMIT 1),
  NULL, 1, 90
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'team' AND lower(name) = 'people team');
INSERT INTO org_units (type, name, parent_id, lead_employee_id, active, sort_order)
SELECT 'team', 'Administration Team',
  (SELECT id FROM org_units WHERE type = 'department' AND lower(name) = 'administration' LIMIT 1),
  NULL, 1, 110
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE type = 'team' AND lower(name) = 'administration team');
UPDATE org_units
SET parent_id = (SELECT id FROM org_units WHERE type = 'company' AND lower(name) = 'incora' LIMIT 1)
WHERE type = 'division' AND lower(name) = 'ukraine';
UPDATE org_units
SET parent_id = (SELECT id FROM org_units WHERE type = 'division' AND lower(name) = 'ukraine' LIMIT 1)
WHERE type = 'department' AND lower(name) IN ('engineering', 'design', 'delivery', 'people', 'administration');
UPDATE org_units AS team
SET parent_id = (
  SELECT department.id
  FROM org_units AS department
  WHERE department.type = 'department'
    AND lower(department.name) = lower(replace(team.name, ' Team', ''))
  LIMIT 1
)
WHERE team.type = 'team' AND team.name LIKE '% Team';

INSERT OR IGNORE INTO reference_values (kind, value, label, sort_order)
VALUES
  ('position', 'people operations lead', 'People Operations Lead', 10),
  ('position', 'senior product designer', 'Senior Product Designer', 20),
  ('position', 'frontend engineer', 'Frontend Engineer', 30),
  ('position', 'qa engineer', 'QA Engineer', 40),
  ('position', 'business analyst', 'Business Analyst', 50),
  ('position', 'talent partner', 'Talent Partner', 60),
  ('position', 'backend engineer', 'Backend Engineer', 70),
  ('position', 'engineering director', 'Engineering Director', 80),
  ('position', 'design lead', 'Design Lead', 90),
  ('position', 'delivery manager', 'Delivery Manager', 100),
  ('position', 'super administrator', 'Super Administrator', 110),
  ('level', 'lead', 'Lead', 10),
  ('level', 'middle', 'Middle', 20),
  ('level', 'administrator', 'Administrator', 30);

INSERT OR IGNORE INTO employment_types (value, label, sort_order)
VALUES
  ('full-time', 'Full-time', 10),
  ('contractor', 'Contractor', 20);

INSERT OR IGNORE INTO employees
  (employee_code, first_name, last_name, ukrainian_name, email,
   personal_email, phone, birth_date, gender, address, job_title,
   department, division, team, level, location, manager_name, manager_id,
   employment_type, employment_type_id, status, start_date, probation_end,
   division_unit_id, department_unit_id, team_unit_id, position_value_id,
   level_value_id)
VALUES
  ('INC-001', 'Demo4', 'FixtureSurname4', 'Demo Person 4', 'person005@example.test',
   'person004@example.test', '+1 202 555 0100', '1990-02-01', 'Male',
   'Lviv, Ukraine', 'People Operations Lead', 'People', 'Ukraine', 'People Team',
   'Lead', 'Lviv', 'Demo Person 11', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2022-03-14', '2022-06-14',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'People' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'People Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'People Operations Lead' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Lead' LIMIT 1)),
  ('INC-002', 'Demo5', 'FixtureSurname5', 'Demo Person 5', 'person022@example.test',
   'person021@example.test', '+1 202 555 0101', '1990-02-02', 'Female',
   'Kyiv, Ukraine', 'Senior Product Designer', 'Design', 'Ukraine', 'Design Team',
   'Middle', 'Kyiv', 'Demo Person 12', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2023-05-08', '2023-08-08',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Design' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Design Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Senior Product Designer' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Middle' LIMIT 1)),
  ('INC-003', 'Demo6', 'FixtureSurname6', 'Demo Person 6', 'person002@example.test',
   'person001@example.test', '+1 202 555 0102', '1990-02-03', 'Male',
   'Lviv, Ukraine', 'Frontend Engineer', 'Engineering', 'Ukraine', 'Engineering Team',
   'Middle', 'Lviv', 'Demo Person 11', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2024-02-19', '2024-05-19',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Engineering' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Engineering Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Frontend Engineer' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Middle' LIMIT 1)),
  ('INC-004', 'Demo7', 'FixtureSurname7', 'Demo Person 7', 'person007@example.test',
   'person006@example.test', '+1 202 555 0103', '1990-02-04', 'Female',
   'Remote, Ukraine', 'QA Engineer', 'Engineering', 'Ukraine', 'Engineering Team',
   'Middle', 'Remote', 'Demo Person 11', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2023-10-02', '2024-01-02',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Engineering' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Engineering Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'QA Engineer' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Middle' LIMIT 1)),
  ('INC-005', 'Demo8', 'FixtureSurname8', 'Demo Person 8', 'person009@example.test',
   'person008@example.test', '+1 202 555 0104', '1990-02-05', 'Male',
   'Lviv, Ukraine', 'Business Analyst', 'Delivery', 'Ukraine', 'Delivery Team',
   'Middle', 'Lviv', 'Demo Person 13', NULL, 'Contractor',
   (SELECT id FROM employment_types WHERE label = 'Contractor' LIMIT 1),
   'active', '2024-06-17', '2024-09-17',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Delivery' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Delivery Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Business Analyst' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Middle' LIMIT 1)),
  ('INC-006', 'Demo9', 'FixtureSurname9', 'Demo Person 9', 'person018@example.test',
   'person017@example.test', '+1 202 555 0105', '1990-02-06', 'Female',
   'Remote, Ukraine', 'Talent Partner', 'People', 'Ukraine', 'People Team',
   'Middle', 'Remote', 'Demo Person 4', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'on_leave', '2021-11-22', '2022-02-22',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'People' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'People Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Talent Partner' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Middle' LIMIT 1)),
  ('INC-007', 'Demo10', 'FixtureSurname10', 'Demo Person 10', 'person020@example.test',
   'person019@example.test', '+1 202 555 0106', '1990-02-07', 'Male',
   'Kyiv, Ukraine', 'Backend Engineer', 'Engineering', 'Ukraine', 'Engineering Team',
   'Middle', 'Kyiv', 'Demo Person 11', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2022-09-12', '2022-12-12',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Engineering' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Engineering Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Backend Engineer' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Middle' LIMIT 1)),
  ('INC-008', 'Demo11', 'FixtureSurname11', 'Demo Person 11', 'person016@example.test',
   'person015@example.test', '+1 202 555 0107', '1990-02-08', 'Male',
   'Lviv, Ukraine', 'Engineering Director', 'Engineering', 'Ukraine', 'Engineering Team',
   'Lead', 'Lviv', NULL, NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2020-08-03', '2020-11-03',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Engineering' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Engineering Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Engineering Director' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Lead' LIMIT 1)),
  ('INC-009', 'Demo12', 'FixtureSurname12', 'Demo Person 12', 'person011@example.test',
   'person010@example.test', '+1 202 555 0108', '1990-02-09', 'Female',
   'Kyiv, Ukraine', 'Design Lead', 'Design', 'Ukraine', 'Design Team',
   'Lead', 'Kyiv', 'Demo Person 11', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2021-04-12', '2021-07-12',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Design' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Design Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Design Lead' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Lead' LIMIT 1)),
  ('INC-010', 'Demo13', 'FixtureSurname13', 'Demo Person 13', 'person014@example.test',
   'person013@example.test', '+1 202 555 0109', '1990-02-10', 'Male',
   'Lviv, Ukraine', 'Delivery Manager', 'Delivery', 'Ukraine', 'Delivery Team',
   'Lead', 'Lviv', 'Demo Person 11', NULL, 'Full-time',
   (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2020-11-16', '2021-02-16',
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Delivery' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Delivery Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Delivery Manager' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Lead' LIMIT 1)),
  ('INC-011', 'Demo2', 'FixtureSurname2', 'Demo Person 2', 'person023@example.test',
   NULL, NULL, NULL, NULL, NULL, 'Super Administrator', 'Administration',
   'Ukraine', 'Administration Team', 'Administrator', 'Remote', NULL, NULL,
   'Full-time', (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2026-07-24', NULL,
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Administration' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Administration Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Super Administrator' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Administrator' LIMIT 1)),
  ('INC-012', 'Demo3', 'FixtureSurname3', 'Demo Person 3', 'person012@example.test',
   NULL, NULL, NULL, NULL, NULL, 'Super Administrator', 'Administration',
   'Ukraine', 'Administration Team', 'Administrator', 'Remote', NULL, NULL,
   'Full-time', (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2026-07-24', NULL,
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Administration' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Administration Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Super Administrator' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Administrator' LIMIT 1)),
  ('INC-013', 'FixtureSurname9', 'FixtureSurname1', 'Demo Person 1', 'person003@example.test',
   NULL, NULL, NULL, NULL, NULL, 'Super Administrator', 'Administration',
   'Ukraine', 'Administration Team', 'Administrator', 'Office', NULL, NULL,
   'Full-time', (SELECT id FROM employment_types WHERE label = 'Full-time' LIMIT 1),
   'active', '2026-07-28', NULL,
   (SELECT id FROM org_units WHERE type = 'division' AND name = 'Ukraine' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'department' AND name = 'Administration' LIMIT 1),
   (SELECT id FROM org_units WHERE type = 'team' AND name = 'Administration Team' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'position' AND label = 'Super Administrator' LIMIT 1),
   (SELECT id FROM reference_values WHERE kind = 'level' AND label = 'Administrator' LIMIT 1));

-- Existing migration history may already contain the three protected
-- administrator profiles. Resolve every relationship by email rather than
-- assuming a particular auto-increment id.
UPDATE employees
SET
  division_unit_id = (SELECT id FROM org_units WHERE type = 'division' AND lower(trim(name)) = lower(trim(employees.division)) ORDER BY active DESC, id LIMIT 1),
  department_unit_id = (SELECT id FROM org_units WHERE type = 'department' AND lower(trim(name)) = lower(trim(employees.department)) ORDER BY active DESC, id LIMIT 1),
  team_unit_id = (SELECT id FROM org_units WHERE type = 'team' AND lower(trim(name)) = lower(trim(employees.team)) ORDER BY active DESC, id LIMIT 1),
  position_value_id = (SELECT id FROM reference_values WHERE kind = 'position' AND lower(trim(label)) = lower(trim(employees.job_title)) ORDER BY active DESC, id LIMIT 1),
  level_value_id = (SELECT id FROM reference_values WHERE kind = 'level' AND lower(trim(label)) = lower(trim(employees.level)) ORDER BY active DESC, id LIMIT 1),
  employment_type_id = (SELECT id FROM employment_types WHERE lower(trim(label)) = lower(trim(employees.employment_type)) ORDER BY active DESC, id LIMIT 1)
WHERE division_unit_id IS NULL
   OR department_unit_id IS NULL
   OR position_value_id IS NULL
   OR employment_type_id IS NULL;

UPDATE employees
SET manager_id = CASE lower(email)
  WHEN 'person005@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person016@example.test' LIMIT 1)
  WHEN 'person022@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person011@example.test' LIMIT 1)
  WHEN 'person002@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person016@example.test' LIMIT 1)
  WHEN 'person007@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person016@example.test' LIMIT 1)
  WHEN 'person009@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person014@example.test' LIMIT 1)
  WHEN 'person018@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person005@example.test' LIMIT 1)
  WHEN 'person020@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person016@example.test' LIMIT 1)
  WHEN 'person011@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person016@example.test' LIMIT 1)
  WHEN 'person014@example.test' THEN (SELECT id FROM employees WHERE lower(email) = 'person016@example.test' LIMIT 1)
  ELSE manager_id
END
WHERE manager_id IS NULL
  AND lower(email) IN (
    'person005@example.test',
    'person022@example.test',
    'person002@example.test',
    'person007@example.test',
    'person009@example.test',
    'person018@example.test',
    'person020@example.test',
    'person011@example.test',
    'person014@example.test'
  );

INSERT OR IGNORE INTO employee_document_folders
  (employee_id, name, visibility, created_by_email)
SELECT id, 'Employee documents', 'employee_hr', 'system@incora.local'
FROM employees;

INSERT OR IGNORE INTO employee_document_folders
  (employee_id, name, visibility, created_by_email)
SELECT id, 'HR private', 'hr_only', 'system@incora.local'
FROM employees;

UPDATE org_units SET lead_employee_id =
  (SELECT id FROM employees WHERE email = 'person005@example.test' LIMIT 1)
WHERE type = 'company' AND lower(name) = 'incora';
UPDATE org_units SET lead_employee_id =
  (SELECT id FROM employees WHERE email = 'person005@example.test' LIMIT 1)
WHERE type = 'division' AND lower(name) = 'ukraine';
UPDATE org_units SET lead_employee_id =
  (SELECT id FROM employees WHERE email = 'person016@example.test' LIMIT 1)
WHERE type = 'department' AND lower(name) = 'engineering';
UPDATE org_units SET lead_employee_id =
  (SELECT id FROM employees WHERE email = 'person011@example.test' LIMIT 1)
WHERE type = 'department' AND lower(name) = 'design';
UPDATE org_units SET lead_employee_id =
  (SELECT id FROM employees WHERE email = 'person014@example.test' LIMIT 1)
WHERE type = 'department' AND lower(name) = 'delivery';
UPDATE org_units SET lead_employee_id =
  (SELECT id FROM employees WHERE email = 'person005@example.test' LIMIT 1)
WHERE type = 'department' AND lower(name) = 'people';
UPDATE org_units SET lead_employee_id =
  (SELECT id FROM employees WHERE email = 'person023@example.test' LIMIT 1)
WHERE type = 'department' AND lower(name) = 'administration';
UPDATE org_units AS team SET lead_employee_id =
  CASE lower(team.name)
    WHEN 'engineering team' THEN (SELECT id FROM employees WHERE email = 'person016@example.test' LIMIT 1)
    WHEN 'design team' THEN (SELECT id FROM employees WHERE email = 'person011@example.test' LIMIT 1)
    WHEN 'delivery team' THEN (SELECT id FROM employees WHERE email = 'person014@example.test' LIMIT 1)
    WHEN 'people team' THEN (SELECT id FROM employees WHERE email = 'person005@example.test' LIMIT 1)
    WHEN 'administration team' THEN (SELECT id FROM employees WHERE email = 'person023@example.test' LIMIT 1)
    ELSE team.lead_employee_id
  END
WHERE team.type = 'team';

INSERT OR IGNORE INTO users (email, role, employee_id)
SELECT
  email,
  CASE
    WHEN lower(email) IN (
      'person005@example.test',
      'person023@example.test',
      'person012@example.test',
      'person003@example.test'
    ) THEN 'super_admin'
    WHEN lower(email) IN (
      'person016@example.test',
      'person011@example.test',
      'person014@example.test'
    ) THEN 'manager'
    ELSE 'employee'
  END,
  id
FROM employees;

UPDATE users
SET employee_id = (
  SELECT employees.id
  FROM employees
  WHERE lower(employees.email) = lower(users.email)
  LIMIT 1
)
WHERE
  employee_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM employees
    WHERE lower(employees.email) = lower(users.email)
  );

INSERT OR IGNORE INTO users (email, role, employee_id)
VALUES
  ('person023@example.test', 'super_admin', NULL),
  ('person012@example.test', 'super_admin', NULL),
  ('person003@example.test', 'super_admin', NULL);

INSERT OR IGNORE INTO access_policies
  (role, label, manage_people, view_sensitive_data, approve_leave,
   approve_time, approve_expenses, view_audit, manage_settings)
VALUES
  ('super_admin', 'Super administrators', 1, 1, 1, 1, 1, 1, 1),
  ('hr_admin', 'HR administrators', 1, 1, 1, 1, 1, 1, 1),
  ('manager', 'Managers', 0, 0, 1, 1, 1, 0, 0),
  ('employee', 'Employees', 0, 0, 0, 0, 0, 0, 0);

INSERT OR IGNORE INTO reimbursement_policies
  (id, name, currency, per_request_limit, annual_limit, max_requests_per_year,
   requires_receipt, requires_approval, enabled)
VALUES
  (1, 'INCORA expense reimbursement', 'UAH', 150000, 600000, 12, 1, 1, 1);

INSERT OR IGNORE INTO leave_types
  (id, code, name, color, default_allowance, requires_approval)
VALUES
  (1, 'vacation', 'Vacation', '#27b3a2', 20, 1),
  (2, 'sick', 'Sick Leave', '#e05a67', 10, 1),
  (3, 'unpaid', 'Unpaid Leave', '#5577c8', 0, 1);

INSERT OR IGNORE INTO leave_balances
  (employee_id, leave_type_id, year, allowance, used, adjustment)
SELECT employees.id, leave_types.id, 2026, leave_types.default_allowance, 0, 0
FROM employees CROSS JOIN leave_types;

INSERT OR IGNORE INTO work_schedules
  (employee_id, work_days, start_time, end_time, break_minutes, timezone)
SELECT id, '1,2,3,4,5', '09:00', '18:00', 60, 'Europe/Kyiv'
FROM employees
WHERE lower(email) = 'person005@example.test';

INSERT OR IGNORE INTO audit_events
  (id, actor_email, action, entity_type, entity_id, details, created_at)
VALUES
  (1, 'system', 'workspace.seeded', 'workspace', 'incora',
   'Explicit demo seed applied', CURRENT_TIMESTAMP);
