PRAGMA foreign_keys = OFF;--> statement-breakpoint
CREATE TABLE `users_next` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL UNIQUE,
  `role` text DEFAULT 'employee' NOT NULL
    CHECK (`role` IN ('super_admin', 'hr_admin', 'manager', 'employee')),
  `employee_id` integer,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
);--> statement-breakpoint
INSERT INTO `users_next` (`id`, `email`, `role`, `employee_id`)
SELECT `id`, `email`, `role`, `employee_id`
FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `users_next` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_employee_id_unique`
  ON `users` (`employee_id`);--> statement-breakpoint
UPDATE `employees`
SET
  `last_name` = 'FixtureSurname4',
  `ukrainian_name` = 'Demo Person 4',
  `email` = 'person005@example.test'
WHERE
  lower(`first_name`) = 'demo4'
  AND (
    lower(`last_name`) IN ('koval', 'fixturesurname4')
    OR lower(`email`) = 'admin@incora.software'
  );--> statement-breakpoint
DELETE FROM `users`
WHERE
  lower(`email`) = 'person005@example.test'
  AND `employee_id` IS NULL;--> statement-breakpoint
UPDATE `users`
SET
  `email` = 'person005@example.test',
  `role` = 'super_admin'
WHERE `employee_id` = (
  SELECT `id`
  FROM `employees`
  WHERE lower(`email`) = 'person005@example.test'
  LIMIT 1
);--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`email`, `role`, `employee_id`)
SELECT
  'person005@example.test',
  'super_admin',
  `id`
FROM `employees`
WHERE lower(`email`) = 'person005@example.test'
LIMIT 1;--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`email`, `role`, `employee_id`)
VALUES ('person023@example.test', 'super_admin', NULL);--> statement-breakpoint
UPDATE `users`
SET `role` = 'super_admin'
WHERE lower(`email`) IN (
  'person005@example.test',
  'person023@example.test'
);--> statement-breakpoint
INSERT INTO `access_policies`
  (`role`, `label`, `manage_people`, `view_sensitive_data`, `approve_leave`,
   `approve_time`, `approve_expenses`, `view_audit`, `manage_settings`)
VALUES
  ('super_admin', 'Super administrators', 1, 1, 1, 1, 1, 1, 1)
ON CONFLICT(`role`) DO UPDATE SET
  `label` = excluded.`label`,
  `manage_people` = 1,
  `view_sensitive_data` = 1,
  `approve_leave` = 1,
  `approve_time` = 1,
  `approve_expenses` = 1,
  `view_audit` = 1,
  `manage_settings` = 1,
  `updated_at` = CURRENT_TIMESTAMP;--> statement-breakpoint
PRAGMA foreign_keys = ON;
