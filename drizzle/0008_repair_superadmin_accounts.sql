DELETE FROM `users`
WHERE
  lower(`email`) = 'person005@example.test'
  AND `employee_id` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `users` legacy
    WHERE lower(legacy.`email`) = 'admin@incora.software'
  );--> statement-breakpoint
UPDATE `users`
SET
  `email` = 'person005@example.test',
  `role` = 'super_admin'
WHERE lower(`email`) = 'admin@incora.software';--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`email`, `role`, `employee_id`)
VALUES
  ('person005@example.test', 'super_admin', NULL),
  ('person023@example.test', 'super_admin', NULL),
  ('person012@example.test', 'super_admin', NULL);--> statement-breakpoint
UPDATE `users`
SET `role` = 'super_admin'
WHERE lower(`email`) IN (
  'person005@example.test',
  'person023@example.test',
  'person012@example.test'
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
  `updated_at` = CURRENT_TIMESTAMP;
