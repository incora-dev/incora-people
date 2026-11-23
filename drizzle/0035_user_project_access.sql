ALTER TABLE `users` ADD `manage_projects` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `manage_projects` = true WHERE `role` = 'super_admin';
