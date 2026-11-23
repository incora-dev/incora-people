CREATE TABLE `company_holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_holidays_date_unique` ON `company_holidays` (`date`);
--> statement-breakpoint
CREATE TABLE `people_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL CHECK (`category` IN ('onboarding', 'offboarding', 'general')),
	`assignee_employee_id` integer NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'todo' NOT NULL CHECK (`status` IN ('todo', 'done')),
	`created_by_email` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`assignee_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `people_tasks_assignee_status_idx` ON `people_tasks` (`assignee_employee_id`, `status`);
--> statement-breakpoint
CREATE INDEX `people_tasks_due_date_idx` ON `people_tasks` (`due_date`);
--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('employee_document', 'reimbursement_receipt')),
	`category` text DEFAULT 'other' NOT NULL CHECK (`category` IN ('contract', 'identity', 'tax', 'policy', 'receipt', 'other')),
	`owner_employee_id` integer NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL CHECK (`size_bytes` > 0 AND `size_bytes` <= 10485760),
	`uploaded_by_email` text NOT NULL,
	`related_entity_type` text,
	`related_entity_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stored_files_object_key_unique` ON `stored_files` (`object_key`);
--> statement-breakpoint
CREATE INDEX `stored_files_owner_kind_idx` ON `stored_files` (`owner_employee_id`, `kind`, `created_at`);
--> statement-breakpoint
CREATE INDEX `stored_files_related_idx` ON `stored_files` (`related_entity_type`, `related_entity_id`);
--> statement-breakpoint
CREATE TABLE `timesheet_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`month` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL CHECK (`status` IN ('open', 'locked')),
	`note` text DEFAULT '' NOT NULL,
	`locked_by_email` text,
	`locked_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timesheet_periods_employee_month_unique` ON `timesheet_periods` (`employee_id`,`month`);
--> statement-breakpoint
CREATE INDEX `timesheet_periods_month_status_idx` ON `timesheet_periods` (`month`, `status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `break_entries_one_open_per_entry` ON `break_entries` (`time_entry_id`) WHERE "break_entries"."ended_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `time_entries_one_open_per_employee` ON `time_entries` (`employee_id`) WHERE "time_entries"."clock_out" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_employee_id_unique` ON `users` (`employee_id`);
