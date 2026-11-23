INSERT OR IGNORE INTO employees
  (employee_code, first_name, last_name, ukrainian_name, email, job_title,
   department, division, team, level, location, default_work_mode,
   employment_type, status, start_date)
VALUES
  ('INC-013', 'FixtureSurname9', 'FixtureSurname1', 'Demo Person 1',
   'person003@example.test', 'Super Administrator', 'Administration',
   'Ukraine', 'Administration Team', 'Administrator', 'Office', 'office',
   'Full-time', 'active', '2026-07-28');

INSERT OR IGNORE INTO users (email, role, employee_id)
SELECT email, 'super_admin', id
FROM employees
WHERE lower(email) = 'person003@example.test';

UPDATE users
SET
  role = 'super_admin',
  employee_id = COALESCE(
    employee_id,
    (SELECT id FROM employees
     WHERE lower(email) = 'person003@example.test'
     LIMIT 1)
  )
WHERE lower(email) = 'person003@example.test';

INSERT OR IGNORE INTO leave_balances
  (employee_id, leave_type_id, year, allowance, used, adjustment)
SELECT employees.id, leave_types.id, 2026,
       leave_types.default_allowance, 0, 0
FROM employees
CROSS JOIN leave_types
WHERE lower(employees.email) = 'person003@example.test';
