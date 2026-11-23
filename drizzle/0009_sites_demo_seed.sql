INSERT OR IGNORE INTO `employees`
  (`id`, `employee_code`, `first_name`, `last_name`, `ukrainian_name`, `email`,
   `personal_email`, `phone`, `birth_date`, `gender`, `address`, `job_title`,
   `department`, `division`, `team`, `level`, `location`, `manager_name`, `manager_id`,
   `employment_type`, `status`, `start_date`, `probation_end`)
VALUES
  (1, 'INC-001', 'Demo4', 'FixtureSurname4', 'Demo Person 4', 'person005@example.test',
   'person004@example.test', '+1 202 555 0100', '1990-02-01', 'Male',
   'Lviv, Ukraine', 'People Operations Lead', 'People', 'Ukraine', 'People Team',
   'Lead', 'Lviv', 'Demo Person 11', NULL, 'Full-time', 'active', '2022-03-14', '2022-06-14'),
  (2, 'INC-002', 'Demo5', 'FixtureSurname5', 'Demo Person 5', 'person022@example.test',
   'person021@example.test', '+1 202 555 0101', '1990-02-02', 'Female',
   'Kyiv, Ukraine', 'Senior Product Designer', 'Design', 'Ukraine', 'Design Team',
   'Middle', 'Kyiv', 'Demo Person 12', NULL, 'Full-time', 'active', '2023-05-08', '2023-08-08'),
  (3, 'INC-003', 'Demo6', 'FixtureSurname6', 'Demo Person 6', 'person002@example.test',
   'person001@example.test', '+1 202 555 0102', '1990-02-03', 'Male',
   'Lviv, Ukraine', 'Frontend Engineer', 'Engineering', 'Ukraine', 'Engineering Team',
   'Middle', 'Lviv', 'Demo Person 11', NULL, 'Full-time', 'active', '2024-02-19', '2024-05-19'),
  (4, 'INC-004', 'Demo7', 'FixtureSurname7', 'Demo Person 7', 'person007@example.test',
   'person006@example.test', '+1 202 555 0103', '1990-02-04', 'Female',
   'Remote, Ukraine', 'QA Engineer', 'Engineering', 'Ukraine', 'Engineering Team',
   'Middle', 'Remote', 'Demo Person 11', NULL, 'Full-time', 'active', '2023-10-02', '2024-01-02'),
  (5, 'INC-005', 'Demo8', 'FixtureSurname8', 'Demo Person 8', 'person009@example.test',
   'person008@example.test', '+1 202 555 0104', '1990-02-05', 'Male',
   'Lviv, Ukraine', 'Business Analyst', 'Delivery', 'Ukraine', 'Delivery Team',
   'Middle', 'Lviv', 'Demo Person 13', NULL, 'Contractor', 'active', '2024-06-17', '2024-09-17'),
  (6, 'INC-006', 'Demo9', 'FixtureSurname9', 'Demo Person 9', 'person018@example.test',
   'person017@example.test', '+1 202 555 0105', '1990-02-06', 'Female',
   'Remote, Ukraine', 'Talent Partner', 'People', 'Ukraine', 'People Team',
   'Middle', 'Remote', 'Demo Person 4', NULL, 'Full-time', 'on_leave', '2021-11-22', '2022-02-22'),
  (7, 'INC-007', 'Demo10', 'FixtureSurname10', 'Demo Person 10', 'person020@example.test',
   'person019@example.test', '+1 202 555 0106', '1990-02-07', 'Male',
   'Kyiv, Ukraine', 'Backend Engineer', 'Engineering', 'Ukraine', 'Engineering Team',
   'Middle', 'Kyiv', 'Demo Person 11', NULL, 'Full-time', 'active', '2022-09-12', '2022-12-12'),
  (8, 'INC-008', 'Demo11', 'FixtureSurname11', 'Demo Person 11', 'person016@example.test',
   'person015@example.test', '+1 202 555 0107', '1990-02-08', 'Male',
   'Lviv, Ukraine', 'Engineering Director', 'Engineering', 'Ukraine', 'Engineering Team',
   'Lead', 'Lviv', NULL, NULL, 'Full-time', 'active', '2020-08-03', '2020-11-03'),
  (9, 'INC-009', 'Demo12', 'FixtureSurname12', 'Demo Person 12', 'person011@example.test',
   'person010@example.test', '+1 202 555 0108', '1990-02-09', 'Female',
   'Kyiv, Ukraine', 'Design Lead', 'Design', 'Ukraine', 'Design Team',
   'Lead', 'Kyiv', 'Demo Person 11', NULL, 'Full-time', 'active', '2021-04-12', '2021-07-12'),
  (10, 'INC-010', 'Demo13', 'FixtureSurname13', 'Demo Person 13', 'person014@example.test',
   'person013@example.test', '+1 202 555 0109', '1990-02-10', 'Male',
   'Lviv, Ukraine', 'Delivery Manager', 'Delivery', 'Ukraine', 'Delivery Team',
   'Lead', 'Lviv', 'Demo Person 11', NULL, 'Full-time', 'active', '2020-11-16', '2021-02-16');--> statement-breakpoint
UPDATE `employees`
SET `manager_id` = CASE `id`
  WHEN 1 THEN 8
  WHEN 2 THEN 9
  WHEN 3 THEN 8
  WHEN 4 THEN 8
  WHEN 5 THEN 10
  WHEN 6 THEN 1
  WHEN 7 THEN 8
  WHEN 9 THEN 8
  WHEN 10 THEN 8
  ELSE `manager_id`
END
WHERE `id` IN (1, 2, 3, 4, 5, 6, 7, 9, 10) AND `manager_id` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`email`, `role`, `employee_id`)
SELECT
  `email`,
  CASE
    WHEN `id` = 1 THEN 'super_admin'
    WHEN `id` IN (8, 9, 10) THEN 'manager'
    ELSE 'employee'
  END,
  `id`
FROM `employees`;--> statement-breakpoint
UPDATE `users`
SET `employee_id` = (
  SELECT `employees`.`id`
  FROM `employees`
  WHERE lower(`employees`.`email`) = lower(`users`.`email`)
  LIMIT 1
)
WHERE
  `employee_id` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `employees`
    WHERE lower(`employees`.`email`) = lower(`users`.`email`)
  );--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`email`, `role`, `employee_id`)
VALUES
  ('person023@example.test', 'super_admin', NULL),
  ('person012@example.test', 'super_admin', NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `access_policies`
  (`role`, `label`, `manage_people`, `view_sensitive_data`, `approve_leave`,
   `approve_time`, `approve_expenses`, `view_audit`, `manage_settings`)
VALUES
  ('super_admin', 'Super administrators', 1, 1, 1, 1, 1, 1, 1),
  ('hr_admin', 'HR administrators', 1, 1, 1, 1, 1, 1, 1),
  ('manager', 'Managers', 0, 0, 1, 1, 1, 0, 0),
  ('employee', 'Employees', 0, 0, 0, 0, 0, 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO `reimbursement_policies`
  (`id`, `name`, `currency`, `per_request_limit`, `annual_limit`, `max_requests_per_year`,
   `requires_receipt`, `requires_approval`, `enabled`)
VALUES
  (1, 'INCORA expense reimbursement', 'UAH', 150000, 600000, 12, 1, 1, 1);--> statement-breakpoint
INSERT OR IGNORE INTO `org_units`
  (`id`, `type`, `name`, `parent_id`, `lead_employee_id`, `active`, `sort_order`)
VALUES
  (1, 'company', 'INCORA', NULL, 1, 1, 0),
  (2, 'division', 'Ukraine', 1, 1, 1, 10),
  (3, 'department', 'Engineering', 2, 8, 1, 20),
  (4, 'department', 'Design', 2, 9, 1, 30),
  (5, 'department', 'Delivery', 2, 10, 1, 40),
  (6, 'department', 'People', 2, 1, 1, 50),
  (7, 'team', 'Engineering Team', 3, 8, 1, 60),
  (8, 'team', 'Design Team', 4, 9, 1, 70),
  (9, 'team', 'Delivery Team', 5, 10, 1, 80),
  (10, 'team', 'People Team', 6, 1, 1, 90);--> statement-breakpoint
INSERT OR IGNORE INTO `leave_types`
  (`id`, `code`, `name`, `color`, `default_allowance`, `requires_approval`)
VALUES
  (1, 'vacation', 'Vacation', '#27b3a2', 20, 1),
  (2, 'sick', 'Sick Leave', '#e05a67', 10, 1),
  (3, 'unpaid', 'Unpaid Leave', '#5577c8', 0, 1);--> statement-breakpoint
INSERT OR IGNORE INTO `leave_balances`
  (`employee_id`, `leave_type_id`, `year`, `allowance`, `used`, `adjustment`)
SELECT `employees`.`id`, `leave_types`.`id`, 2026, `leave_types`.`default_allowance`, 0, 0
FROM `employees` CROSS JOIN `leave_types`;--> statement-breakpoint
INSERT OR IGNORE INTO `work_schedules`
  (`employee_id`, `work_days`, `start_time`, `end_time`, `break_minutes`, `timezone`)
VALUES
  (1, '1,2,3,4,5', '09:00', '18:00', 60, 'Europe/Kyiv');--> statement-breakpoint
INSERT OR IGNORE INTO `audit_events`
  (`id`, `actor_email`, `action`, `entity_type`, `entity_id`, `details`, `created_at`)
VALUES
  (1, 'system', 'workspace.seeded', 'workspace', 'incora',
   'Explicit Sites demo seed applied', CURRENT_TIMESTAMP);
