INSERT OR IGNORE INTO `employees`
  (`employee_code`, `first_name`, `last_name`, `ukrainian_name`, `email`,
   `job_title`, `department`, `division`, `team`, `level`, `location`,
   `employment_type`, `status`, `start_date`)
VALUES
  ('INC-011', 'Demo2', 'FixtureSurname2', 'Demo Person 2',
   'person023@example.test', 'Super Administrator', 'Administration',
   'Ukraine', 'Administration Team', 'Administrator', 'Remote', 'Full-time',
   'active', '2026-07-24'),
  ('INC-012', 'Demo3', 'FixtureSurname3', 'Demo Person 3',
   'person012@example.test', 'Super Administrator', 'Administration',
   'Ukraine', 'Administration Team', 'Administrator', 'Remote', 'Full-time',
   'active', '2026-07-24');--> statement-breakpoint
UPDATE `users`
SET `employee_id` = (
  SELECT `employees`.`id`
  FROM `employees`
  WHERE lower(`employees`.`email`) = lower(`users`.`email`)
  LIMIT 1
)
WHERE
  lower(`email`) IN (
    'person023@example.test',
    'person012@example.test'
  )
  AND `employee_id` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `leave_balances`
  (`employee_id`, `leave_type_id`, `year`, `allowance`, `used`, `adjustment`)
SELECT
  `employees`.`id`,
  `leave_types`.`id`,
  2026,
  `leave_types`.`default_allowance`,
  0,
  0
FROM `employees`
CROSS JOIN `leave_types`
WHERE lower(`employees`.`email`) IN (
  'person023@example.test',
  'person012@example.test'
);--> statement-breakpoint
INSERT OR IGNORE INTO `org_units`
  (`type`, `name`, `parent_id`, `lead_employee_id`, `active`, `sort_order`)
SELECT
  'department',
  'Administration',
  2,
  `id`,
  1,
  100
FROM `employees`
WHERE lower(`email`) = 'person023@example.test'
  AND NOT EXISTS (
    SELECT 1 FROM `org_units` WHERE lower(`name`) = 'administration'
  );--> statement-breakpoint
INSERT OR IGNORE INTO `org_units`
  (`type`, `name`, `parent_id`, `lead_employee_id`, `active`, `sort_order`)
SELECT
  'team',
  'Administration Team',
  (SELECT `id` FROM `org_units` WHERE lower(`name`) = 'administration' LIMIT 1),
  `id`,
  1,
  110
FROM `employees`
WHERE lower(`email`) = 'person023@example.test'
  AND NOT EXISTS (
    SELECT 1 FROM `org_units` WHERE lower(`name`) = 'administration team'
  );
