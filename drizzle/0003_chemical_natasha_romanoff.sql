CREATE TABLE `access_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`label` text NOT NULL,
	`manage_people` integer DEFAULT false NOT NULL,
	`view_sensitive_data` integer DEFAULT false NOT NULL,
	`approve_leave` integer DEFAULT false NOT NULL,
	`approve_time` integer DEFAULT false NOT NULL,
	`view_audit` integer DEFAULT false NOT NULL,
	`manage_settings` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_policies_role_unique` ON `access_policies` (`role`);