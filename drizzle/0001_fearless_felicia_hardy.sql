CREATE TABLE `break_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`time_entry_id` integer NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`time_entry_id`) REFERENCES `time_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `time_corrections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`time_entry_id` integer,
	`requested_clock_in` text NOT NULL,
	`requested_clock_out` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_email` text,
	`reviewer_note` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`time_entry_id`) REFERENCES `time_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`work_days` text DEFAULT '1,2,3,4,5' NOT NULL,
	`start_time` text DEFAULT '09:00' NOT NULL,
	`end_time` text DEFAULT '18:00' NOT NULL,
	`break_minutes` integer DEFAULT 60 NOT NULL,
	`timezone` text DEFAULT 'Europe/Kyiv' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_schedules_employee_id_unique` ON `work_schedules` (`employee_id`);--> statement-breakpoint
ALTER TABLE `employees` ADD `manager_id` integer;