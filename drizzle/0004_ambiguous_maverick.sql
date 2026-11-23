CREATE TABLE `org_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`lead_employee_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lead_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reimbursement_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'UAH' NOT NULL,
	`per_request_limit` integer DEFAULT 100000 NOT NULL,
	`annual_limit` integer DEFAULT 300000 NOT NULL,
	`max_requests_per_year` integer DEFAULT 12 NOT NULL,
	`requires_receipt` integer DEFAULT true NOT NULL,
	`requires_approval` integer DEFAULT true NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reimbursement_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'UAH' NOT NULL,
	`expense_date` text NOT NULL,
	`description` text NOT NULL,
	`receipt_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_email` text,
	`reviewer_note` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `access_policies` ADD `approve_expenses` integer DEFAULT false NOT NULL;