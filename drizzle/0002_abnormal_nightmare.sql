CREATE TABLE `employment_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`effective_date` text NOT NULL,
	`job_title` text NOT NULL,
	`department` text NOT NULL,
	`division` text DEFAULT 'Ukraine' NOT NULL,
	`team` text,
	`level` text,
	`location` text NOT NULL,
	`manager_id` integer,
	`employment_type` text NOT NULL,
	`status` text NOT NULL,
	`change_reason` text DEFAULT 'Profile update' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`leave_type_id` integer NOT NULL,
	`year` integer NOT NULL,
	`allowance` integer DEFAULT 0 NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`adjustment` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_balances_employee_type_year_unique` ON `leave_balances` (`employee_id`,`leave_type_id`,`year`);--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`leave_type_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`days` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_email` text,
	`reviewer_note` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`default_allowance` integer DEFAULT 0 NOT NULL,
	`requires_approval` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_types_code_unique` ON `leave_types` (`code`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`href` text DEFAULT '/' NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `employee_code` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `ukrainian_name` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `personal_email` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `address` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `division` text DEFAULT 'Ukraine' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `team` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `level` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `probation_end` text;