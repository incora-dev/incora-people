PRAGMA foreign_keys = OFF;

CREATE TABLE users_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'employee'
    CHECK (role IN ('super_admin', 'hr_admin', 'manager', 'employee')),
  employee_id INTEGER REFERENCES employees(id)
);

INSERT INTO users_next (id, email, role, employee_id)
SELECT id, email, role, employee_id
FROM users;

DROP TABLE users;
ALTER TABLE users_next RENAME TO users;
CREATE UNIQUE INDEX users_employee_id_unique
  ON users(employee_id) WHERE employee_id IS NOT NULL;

UPDATE employees
SET
  last_name = 'FixtureSurname4',
  ukrainian_name = 'Demo Person 4',
  email = 'person005@example.test'
WHERE
  lower(first_name) = 'demo4'
  AND (
    lower(last_name) IN ('koval', 'fixturesurname4')
    OR lower(email) = 'admin@incora.software'
  );

DELETE FROM users
WHERE
  lower(email) = 'person005@example.test'
  AND employee_id IS NULL;

UPDATE users
SET
  email = 'person005@example.test',
  role = 'super_admin'
WHERE employee_id = (
  SELECT id
  FROM employees
  WHERE lower(email) = 'person005@example.test'
  LIMIT 1
);

INSERT OR IGNORE INTO users (email, role, employee_id)
SELECT
  'person005@example.test',
  'super_admin',
  id
FROM employees
WHERE lower(email) = 'person005@example.test'
LIMIT 1;

INSERT OR IGNORE INTO users (email, role, employee_id)
VALUES ('person023@example.test', 'super_admin', NULL);

UPDATE users
SET role = 'super_admin'
WHERE lower(email) IN (
  'person005@example.test',
  'person023@example.test'
);

INSERT INTO access_policies
  (role, label, manage_people, view_sensitive_data, approve_leave,
   approve_time, approve_expenses, view_audit, manage_settings)
VALUES
  ('super_admin', 'Super administrators', 1, 1, 1, 1, 1, 1, 1)
ON CONFLICT(role) DO UPDATE SET
  label = excluded.label,
  manage_people = 1,
  view_sensitive_data = 1,
  approve_leave = 1,
  approve_time = 1,
  approve_expenses = 1,
  view_audit = 1,
  manage_settings = 1,
  updated_at = CURRENT_TIMESTAMP;

PRAGMA foreign_keys = ON;
