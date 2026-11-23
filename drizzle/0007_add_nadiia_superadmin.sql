INSERT OR IGNORE INTO `users` (`email`, `role`, `employee_id`)
VALUES ('person012@example.test', 'super_admin', NULL);--> statement-breakpoint
UPDATE `users`
SET `role` = 'super_admin'
WHERE lower(`email`) = 'person012@example.test';
